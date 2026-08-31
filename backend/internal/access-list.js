import crypto from "node:crypto";
import fs from "node:fs";
import { dirname } from "node:path";
import bcrypt from "bcryptjs";
import ipaddr from "ipaddr.js";
import _ from "lodash";
import { transaction } from "objection";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import { access as logger } from "../logger.js";
import accessListModel from "../models/access_list.js";
import accessListAuthModel from "../models/access_list_auth.js";
import accessListClientModel from "../models/access_list_client.js";
import now from "../models/now_helper.js";
import proxyHostModel from "../models/proxy_host.js";
import internalAuditLog from "./audit-log.js";
import internalGitOps from "./gitops.js";
import internalNginx from "./nginx.js";
import internalOAuth2Proxy from "./oauth2-proxy.js";
import internalTerminal from "./terminal.js";

const omissions = () => {
	return ["is_deleted"];
};

const MAX_AUTH_ITEMS = 500;
const MAX_CLIENT_ITEMS = 2000;
const MAX_MTLS_CERTIFICATE_BYTES = 1024 * 1024;
const MAX_META_BYTES = 64 * 1024;
const accessListLocks = new Map();
const BCRYPT_HASH_PATTERN = /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const APR1_HASH_PATTERN = /^\$apr1\$[./A-Za-z0-9]{1,8}\$[./A-Za-z0-9]{22}$/;

const isSupportedPasswordHash = (value) => BCRYPT_HASH_PATTERN.test(value) || APR1_HASH_PATTERN.test(value);
const hasControlCharacters = (value) =>
	Array.from(value).some((character) => {
		const codePoint = character.codePointAt(0);
		return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
	});

const validateCollectionLimits = (data) => {
	const items = data.items || [];
	const clients = data.clients || [];
	if (!Array.isArray(items) || items.length > MAX_AUTH_ITEMS) {
		throw new errs.ValidationError(`Access lists support at most ${MAX_AUTH_ITEMS} authentication entries`);
	}
	if (!Array.isArray(clients) || clients.length > MAX_CLIENT_ITEMS) {
		throw new errs.ValidationError(`Access lists support at most ${MAX_CLIENT_ITEMS} client rules`);
	}
	if (Buffer.byteLength(JSON.stringify(data.meta || {})) > MAX_META_BYTES) {
		throw new errs.ValidationError("Access-list metadata exceeds 64 KiB");
	}
	if (data.mtls_certificate && Buffer.byteLength(data.mtls_certificate) > MAX_MTLS_CERTIFICATE_BYTES) {
		throw new errs.ValidationError("Access-list mTLS certificate exceeds 1 MiB");
	}
	const usernames = new Set();
	for (const item of items) {
		if (
			typeof item.username !== "string" ||
			!item.username ||
			item.username.length > 255 ||
			item.username.includes(":") ||
			hasControlCharacters(item.username)
		) {
			throw new errs.ValidationError(
				"Access-list usernames must be 1-255 characters and cannot contain colons or controls",
			);
		}
		if (usernames.has(item.username))
			throw new errs.ValidationError(`Duplicate access-list username: ${item.username}`);
		usernames.add(item.username);
		if (typeof item.password === "string" && item.password.length > 4096) {
			throw new errs.ValidationError(`Password for ${item.username} exceeds 4096 characters`);
		}
	}
	const clientRules = new Set();
	for (const client of clients) {
		if (!client || !["allow", "deny"].includes(client.directive)) {
			throw new errs.ValidationError("Access-list client directives must be allow or deny");
		}
		if (
			typeof client.address !== "string" ||
			!client.address ||
			client.address.trim() !== client.address ||
			client.address.length > 80
		) {
			throw new errs.ValidationError("Access-list client addresses must be bounded IP addresses or CIDRs");
		}
		if (client.address !== "all") {
			try {
				if (client.address.includes("/")) ipaddr.parseCIDR(client.address);
				else ipaddr.parse(client.address);
			} catch {
				throw new errs.ValidationError(`Invalid access-list client address: ${client.address}`);
			}
		}
		const key = `${client.directive}:${client.address}`;
		if (clientRules.has(key)) throw new errs.ValidationError(`Duplicate access-list client rule: ${key}`);
		clientRules.add(key);
	}
};

const withAccessListLock = async (key, callback) => {
	const previous = accessListLocks.get(key) || Promise.resolve();
	let release;
	const current = new Promise((resolve) => {
		release = resolve;
	});
	const tail = previous.then(() => current);
	accessListLocks.set(key, tail);
	await previous;
	try {
		return await callback();
	} finally {
		release();
		if (accessListLocks.get(key) === tail) accessListLocks.delete(key);
	}
};

const lockRow = async (trx, id) => {
	const query = accessListModel.query(trx).findById(id).where("is_deleted", 0);
	if (!String(trx.client.config.client).includes("sqlite")) query.forUpdate();
	return await query;
};

const snapshotAccessList = async (trx, id) => {
	const row = await lockRow(trx, id);
	if (!row) throw new errs.ItemNotFoundError(id);
	const [items, clients] = await Promise.all([
		accessListAuthModel.query(trx).where("access_list_id", id),
		accessListClientModel.query(trx).where("access_list_id", id),
	]);
	return {
		row: row.toJSON(),
		items: items.map((item) => item.toJSON()),
		clients: clients.map((client) => client.toJSON()),
	};
};

const prepareAuthItems = async (items, existingItems = []) => {
	const existingByUsername = new Map(existingItems.map((item) => [item.username, item.password]));
	return await Promise.all(
		(items || []).map(async (item) => {
			let password = item.password || existingByUsername.get(item.username);
			if (!password) throw new errs.ValidationError(`A password is required for new user ${item.username}`);
			if (!isSupportedPasswordHash(password)) password = await bcrypt.hash(password, 13);
			return { username: item.username, password };
		}),
	);
};

// Objection only supports portable batch inserts on PostgreSQL. Keep relation
// replacement compatible with SQLite, MySQL, and PostgreSQL.
const insertRows = async (model, trx, rows) => {
	for (const row of rows) await model.query(trx).insert(row);
};

const restoreSnapshot = async (snapshot) => {
	await transaction(accessListModel.knex(), async (trx) => {
		await lockRow(trx, snapshot.row.id);
		const rowData = _.omit(snapshot.row, ["id", "created_on", "modified_on", "items", "clients", "proxy_hosts"]);
		await accessListModel.query(trx).findById(snapshot.row.id).patch(rowData);
		await Promise.all([
			accessListAuthModel.query(trx).delete().where("access_list_id", snapshot.row.id),
			accessListClientModel.query(trx).delete().where("access_list_id", snapshot.row.id),
		]);
		if (snapshot.items.length) {
			await insertRows(
				accessListAuthModel,
				trx,
				snapshot.items.map((item) => _.omit(item, ["id", "created_on", "modified_on"])),
			);
		}
		if (snapshot.clients.length) {
			await insertRows(
				accessListClientModel,
				trx,
				snapshot.clients.map((client) => _.omit(client, ["id", "created_on", "modified_on"])),
			);
		}
	});
};

const aggregateFailure = (message, originalError, rollbackResults) => {
	const rollbackErrors = rollbackResults
		.filter((result) => result.status === "rejected")
		.map((result) => result.reason?.message || String(result.reason));
	const suffix = rollbackErrors.length ? ` Rollback errors: ${rollbackErrors.join("; ")}` : "";
	return new errs.ConfigurationError(`${message}: ${originalError.message}.${suffix}`, originalError);
};

const internalAccessList = {
	/**
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Object}  data
	 * @param   {string}  data.name
	 * @param   {boolean} [data.satisfy_any]
	 * @param   {boolean} [data.pass_auth]
	 * @param   {boolean} [data.mtls_enabled]
	 * @param   {boolean} [data.mtls_use_internal]
	 * @param   {string}  [data.mtls_certificate]
	 * @param   {Object}  [data.meta]
	 * @param   {Array<Object>} data.items
	 * @param   {Array<Object>} [data.clients]
	 * @param   {number} [data.id]
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		await access.can("access_lists:create", data);
		validateCollectionLimits(data);
		const preparedItems = await prepareAuthItems(data.items || []);
		return await withAccessListLock("create", async () => {
			let listId;
			try {
				await transaction(accessListModel.knex(), async (trx) => {
					const row = await accessListModel.query(trx).insertAndFetch(
						/** @type {any} */ ({
							name: data.name,
							satisfy_any: data.satisfy_any,
							pass_auth: data.pass_auth,
							mtls_enabled: data.mtls_enabled || false,
							mtls_use_internal: data.mtls_use_internal || false,
							mtls_certificate: data.mtls_certificate || "",
							meta: data.meta,
							owner_user_id: access.token.getUserId(1),
							revision: 1,
						}),
					);
					listId = row.id;
					if (preparedItems.length) {
						await insertRows(
							accessListAuthModel,
							trx,
							preparedItems.map((item) => ({ ...item, access_list_id: listId })),
						);
					}
					if (data.clients?.length) {
						await insertRows(
							accessListClientModel,
							trx,
							data.clients.map((client) => ({
								access_list_id: listId,
								address: client.address,
								directive: client.directive,
								created_on: now(),
								modified_on: now(),
							})),
						);
					}
				});

				const freshRow = await internalAccessList.get(
					access,
					{
						id: listId,
						expand: ["owner", "items", "clients", "proxy_hosts.access_list.[clients,items]"],
					},
					true,
				);
				await internalAccessList.build(freshRow);
				if (Number.parseInt(freshRow.proxy_host_count, 10)) {
					await internalNginx.bulkGenerateConfigs(proxyHostModel, "proxy_host", freshRow.proxy_hosts);
					await internalNginx.reload();
				}
				if (freshRow.meta?.auth_type === "oauth2_proxy") await internalOAuth2Proxy.start(freshRow);

				await internalAuditLog.add(access, {
					action: "created",
					object_type: "access-list",
					object_id: freshRow.id,
					meta: internalAccessList.maskItems(_.cloneDeep({ ...data, id: freshRow.id })),
				});
				internalGitOps.triggerAutoPush("access-list");
				return internalAccessList.maskItems(freshRow);
			} catch (error) {
				if (!listId) throw error;
				const rollbacks = await Promise.allSettled([
					transaction(accessListModel.knex(), async (trx) => {
						await accessListAuthModel.query(trx).delete().where("access_list_id", listId);
						await accessListClientModel.query(trx).delete().where("access_list_id", listId);
						await accessListModel.query(trx).deleteById(listId);
					}),
					internalNginx.deleteFile(internalAccessList.getFilename({ id: listId })),
					internalNginx.deleteFile(`${internalAccessList.getFilename({ id: listId })}.crt`),
					internalOAuth2Proxy.stop(listId),
				]);
				throw aggregateFailure("Access-list creation failed", error, rollbacks);
			}
		});
	},

	/**
	 * @param  {import("../lib/types.js").Access}  access
	 * @param  {Object}  data
	 * @param  {number}  data.id
	 * @param  {string}  [data.name]
	 * @param  {boolean} [data.satisfy_any]
	 * @param  {boolean} [data.pass_auth]
	 * @param  {boolean} [data.mtls_enabled]
	 * @param  {boolean} [data.mtls_use_internal]
	 * @param  {string}  [data.mtls_certificate]
	 * @param  {Object}  [data.meta]
	 * @param  {Array<{username: string, password?: string}>} [data.items]
	 * @param  {Array<{address: string, directive: string}>}  [data.clients]
	 * @return {Promise}
	 */
	update: async (access, data) => {
		await access.can("access_lists:update", data);
		validateCollectionLimits(data);
		return await withAccessListLock(data.id, async () => {
			let snapshot;
			try {
				await transaction(accessListModel.knex(), async (trx) => {
					snapshot = await snapshotAccessList(trx, data.id);
					const preparedItems =
						data.items === undefined ? null : await prepareAuthItems(data.items, snapshot.items);
					const patch = _.pickBy(
						{
							name: data.name,
							satisfy_any: data.satisfy_any,
							pass_auth: data.pass_auth,
							mtls_enabled: data.mtls_enabled,
							mtls_use_internal: data.mtls_use_internal,
							mtls_certificate: data.mtls_certificate,
							meta: data.meta,
							revision: (Number.parseInt(snapshot.row.revision, 10) || 1) + 1,
						},
						(value) => value !== undefined,
					);
					await accessListModel.query(trx).findById(data.id).patch(patch);
					if (preparedItems) {
						// Delete before insert, within the same row-locked transaction.
						await accessListAuthModel.query(trx).delete().where("access_list_id", data.id);
						if (preparedItems.length) {
							await insertRows(
								accessListAuthModel,
								trx,
								preparedItems.map((item) => ({ ...item, access_list_id: data.id })),
							);
						}
					}
					if (data.clients !== undefined) {
						await accessListClientModel.query(trx).delete().where("access_list_id", data.id);
						if (data.clients.length) {
							await insertRows(
								accessListClientModel,
								trx,
								data.clients.map((client) => ({
									access_list_id: data.id,
									address: client.address,
									directive: client.directive,
									created_on: now(),
									modified_on: now(),
								})),
							);
						}
					}
				});

				await internalTerminal.revokeAccessList(data.id);
				const freshRow = await internalAccessList.get(
					access,
					{
						id: data.id,
						expand: ["owner", "items", "clients", "proxy_hosts.[certificate,access_list.[clients,items]]"],
					},
					true,
				);
				await internalAccessList.build(freshRow);
				if (Number.parseInt(freshRow.proxy_host_count, 10)) {
					await internalNginx.bulkGenerateConfigs(proxyHostModel, "proxy_host", freshRow.proxy_hosts);
					await internalNginx.reload();
				}
				if (freshRow.meta?.auth_type === "oauth2_proxy") await internalOAuth2Proxy.restart(freshRow);
				else await internalOAuth2Proxy.stop(freshRow.id);

				await internalAuditLog.add(access, {
					action: "updated",
					object_type: "access-list",
					object_id: data.id,
					meta: internalAccessList.maskItems(_.cloneDeep(data)),
				});
				internalGitOps.triggerAutoPush("access-list");
				return internalAccessList.maskItems(freshRow);
			} catch (error) {
				if (!snapshot) throw error;
				const rollbackResults = await Promise.allSettled([restoreSnapshot(snapshot)]);
				if (rollbackResults[0].status === "fulfilled") {
					rollbackResults.push(
						...(await Promise.allSettled([
							(async () => {
								const restored = await internalAccessList.get(
									access,
									{
										id: data.id,
										expand: [
											"owner",
											"items",
											"clients",
											"proxy_hosts.[certificate,access_list.[clients,items]]",
										],
									},
									true,
								);
								await internalAccessList.build(restored);
								if (Number.parseInt(restored.proxy_host_count, 10)) {
									await internalNginx.bulkGenerateConfigs(
										proxyHostModel,
										"proxy_host",
										restored.proxy_hosts,
									);
									await internalNginx.reload();
								}
								if (restored.meta?.auth_type === "oauth2_proxy")
									await internalOAuth2Proxy.restart(restored);
								else await internalOAuth2Proxy.stop(restored.id);
							})(),
						])),
					);
				}
				throw aggregateFailure("Access-list update failed", error, rollbackResults);
			}
		});
	},

	/**
	 * @param  {import("../lib/types.js").Access}   access
	 * @param  {Object}   data
	 * @param  {number}  data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @param  {Boolean}  [skipMasking]
	 * @return {Promise}
	 */
	get: async (access, data, skipMasking) => {
		/** @type {any} */
		const thisData = data || {};
		const accessData = await access.can("access_lists:get", thisData.id);

		const query = accessListModel
			.query()
			.select("access_list.*", accessListModel.raw("COUNT(proxy_host.id) as proxy_host_count"))
			.leftJoin("proxy_host", function () {
				this.on("proxy_host.access_list_id", "=", "access_list.id").andOnVal("proxy_host.is_deleted", "=", 0);
			})
			.where("access_list.is_deleted", 0)
			.andWhere("access_list.id", thisData.id)
			.groupBy("access_list.id")
			.allowGraph("[owner,items,clients,proxy_hosts.[certificate,access_list.[clients,items]]]")
			.first();

		if (accessData.permission_visibility !== "all") {
			query.andWhere("access_list.owner_user_id", access.token.getUserId(1));
		}

		if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
			query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
		}

		let row = await query;

		if (!row?.id) {
			throw new errs.ItemNotFoundError(thisData.id);
		}

		row = utils.omitRow(omissions())(row);

		if (!skipMasking && typeof row.items !== "undefined" && row.items) {
			row = internalAccessList.maskItems(row);
		}
		// Custom omissions
		if (typeof data.omit !== "undefined" && data.omit !== null) {
			row = /** @type {any} */ (_.omit(row, data.omit));
		}
		return row;
	},

	/**
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Object}  data
	 * @param   {number} data.id
	 * @param   {String}  [data.reason]
	 * @returns {Promise}
	 */
	delete: async (access, data) => {
		await access.can("access_lists:delete", data.id);
		return await withAccessListLock(data.id, async () => {
			const row = await internalAccessList.get(access, { id: data.id, expand: ["proxy_hosts"] });
			if (!row?.id) throw new errs.ItemNotFoundError(data.id);
			if (Number.parseInt(row.proxy_host_count, 10) > 0 || row.proxy_hosts?.length) {
				throw new errs.ValidationError(
					"Access lists assigned to proxy hosts cannot be deleted; reassign or disable those hosts first",
				);
			}

			const filename = internalAccessList.getFilename(row);
			const stagedFiles = [];
			try {
				for (const path of [filename, `${filename}.crt`]) {
					const staged = `${path}.delete-${crypto.randomUUID()}`;
					try {
						await fs.promises.rename(path, staged);
						stagedFiles.push([path, staged]);
					} catch (error) {
						if (error.code !== "ENOENT") throw error;
					}
				}
				await transaction(accessListModel.knex(), async (trx) => {
					const locked = await lockRow(trx, row.id);
					if (!locked) throw new errs.ItemNotFoundError(row.id);
					const assigned = await proxyHostModel
						.query(trx)
						.where("access_list_id", row.id)
						.where("is_deleted", 0)
						.first();
					if (assigned)
						throw new errs.ValidationError("Access list became assigned while deletion was in progress");
					await accessListModel
						.query(trx)
						.findById(row.id)
						.patch({ is_deleted: 1, revision: (row.revision || 1) + 1 });
				});
				await internalTerminal.revokeAccessList(row.id);
				await internalOAuth2Proxy.stop(row.id);
				await internalAuditLog.add(access, {
					action: "deleted",
					object_type: "access-list",
					object_id: row.id,
					meta: _.omit(internalAccessList.maskItems(row), ["is_deleted", "proxy_hosts"]),
				});
				internalGitOps.triggerAutoPush("access-list");
				const cleanupResults = await Promise.allSettled(
					stagedFiles.map(([, staged]) => fs.promises.unlink(staged)),
				);
				for (const result of cleanupResults) {
					if (result.status === "rejected")
						logger.warn(`Could not remove staged access-list file: ${result.reason.message}`);
				}
				return true;
			} catch (error) {
				const rollbackResults = await Promise.allSettled([
					accessListModel
						.query()
						.findById(row.id)
						.patch({ is_deleted: 0, revision: row.revision || 1 }),
					...stagedFiles.map(([path, staged]) => fs.promises.rename(staged, path)),
				]);
				if (rollbackResults[0].status === "fulfilled" && row.meta?.auth_type === "oauth2_proxy") {
					rollbackResults.push(...(await Promise.allSettled([internalOAuth2Proxy.start(row)])));
				}
				throw aggregateFailure("Access-list deletion failed", error, rollbackResults);
			}
		});
	},

	/**
	 * All Lists
	 *
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [searchQuery]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, searchQuery) => {
		const accessData = await access.can("access_lists:list");

		const query = accessListModel
			.query()
			.select("access_list.*", accessListModel.raw("COUNT(proxy_host.id) as proxy_host_count"))
			.leftJoin("proxy_host", function () {
				this.on("proxy_host.access_list_id", "=", "access_list.id").andOnVal("proxy_host.is_deleted", "=", 0);
			})
			.where("access_list.is_deleted", 0)
			.groupBy("access_list.id")
			.allowGraph("[owner,items,clients]")
			.orderBy("access_list.name", "ASC");

		if (accessData.permission_visibility !== "all") {
			query.andWhere("access_list.owner_user_id", access.token.getUserId(1));
		}

		// Query is used for searching
		if (typeof searchQuery === "string") {
			query.where(function () {
				this.where("name", "like", `%${searchQuery}%`);
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		let rows = await query;
		rows = utils.omitRows(omissions())(rows);

		if (rows) {
			rows.map((row, idx) => {
				if (typeof row.items !== "undefined" && row.items) {
					rows[idx] = internalAccessList.maskItems(row);
				}
				return true;
			});
		}
		return rows;
	},

	/**
	 * Count is used in reports
	 *
	 * @param   {number} user_id
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: async (user_id, visibility) => {
		const query = accessListModel.query().count("id as count").where("is_deleted", 0);

		if (visibility !== "all") {
			query.andWhere("owner_user_id", user_id);
		}

		const row = await query.first();
		return /** @type {any} */ (row).count || 0;
	},

	/**
	 * @param   {Object}  list
	 * @returns {Object}
	 */
	maskItems: (list) => {
		if (list && typeof list.items !== "undefined") {
			list.items.map((val, idx) => {
				let repeatFor = 8;
				let firstChar = "*";

				if (typeof val.password !== "undefined" && val.password) {
					repeatFor = val.password.length - 1;
					firstChar = val.password.charAt(0);
				}

				list.items[idx].hint = firstChar + "*".repeat(repeatFor);
				list.items[idx].password = "";
				return true;
			});
		}
		return list;
	},

	/**
	 * @param   {Object}  list
	 * @param   {number} list.id
	 * @returns {String}
	 */
	getFilename: (list) => {
		return `/data/access/${list.id}`;
	},

	/**
	 * @param   {Object}  list
	 * @param   {number} list.id
	 * @param   {String}  list.name
	 * @param   {Array<{username: string, password?: string}>}   list.items
	 * @param   {boolean} [list.mtls_enabled]
	 * @param   {boolean} [list.mtls_use_internal]
	 * @param   {string}  [list.mtls_certificate]
	 * @returns {Promise}
	 */
	build: async (list) => {
		logger.info(`Building Access file #${list.id} for: ${list.name}`);
		validateCollectionLimits(list);
		const htpasswdFile = internalAccessList.getFilename(list);
		const crtFile = `${htpasswdFile}.crt`;
		await fs.promises.mkdir(dirname(htpasswdFile), { recursive: true, mode: 0o700 });
		const lines = [];
		for (const item of list.items || []) {
			if (!item.password?.length) continue;
			let password = item.password;
			if (!isSupportedPasswordHash(password)) password = await bcrypt.hash(password, 13);
			lines.push(`${item.username}:${password}`);
		}
		const files = [{ path: htpasswdFile, content: lines.length ? `${lines.join("\n")}\n` : "" }];
		if (list.mtls_enabled && !list.mtls_use_internal) {
			if (
				typeof list.mtls_certificate !== "string" ||
				!list.mtls_certificate.includes("-----BEGIN CERTIFICATE-----") ||
				Buffer.byteLength(list.mtls_certificate) > MAX_MTLS_CERTIFICATE_BYTES
			) {
				throw new errs.ConfigurationError("A valid bounded CA certificate is required for mTLS");
			}
			files.push({ path: crtFile, content: list.mtls_certificate });
		}

		const stages = [];
		const backups = [];
		const installed = [];
		try {
			for (const file of files) {
				const stage = `${file.path}.stage-${crypto.randomUUID()}`;
				const handle = await fs.promises.open(stage, "wx", 0o600);
				try {
					await handle.writeFile(file.content, "utf8");
					await handle.sync();
				} finally {
					await handle.close();
				}
				stages.push({ ...file, stage });
			}

			for (const path of [htpasswdFile, crtFile]) {
				const backup = `${path}.backup-${crypto.randomUUID()}`;
				try {
					await fs.promises.rename(path, backup);
					backups.push({ path, backup });
				} catch (error) {
					if (error.code !== "ENOENT") throw error;
				}
			}
			for (const file of stages) {
				await fs.promises.rename(file.stage, file.path);
				installed.push(file.path);
			}
			const cleanupResults = await Promise.allSettled(backups.map(({ backup }) => fs.promises.unlink(backup)));
			for (const result of cleanupResults) {
				if (result.status === "rejected")
					logger.warn(`Could not remove access-list backup: ${result.reason.message}`);
			}
			logger.success(`Built Access file #${list.id} for: ${list.name}`);
		} catch (error) {
			const rollbackResults = await Promise.allSettled([
				...installed.map((path) => fs.promises.unlink(path)),
				...backups.map(({ path, backup }) => fs.promises.rename(backup, path)),
				...stages.map(({ stage }) =>
					fs.promises.unlink(stage).catch((unlinkError) => {
						if (unlinkError.code !== "ENOENT") throw unlinkError;
					}),
				),
			]);
			throw aggregateFailure("Access-list file activation failed", error, rollbackResults);
		}
	},
};

export default internalAccessList;
