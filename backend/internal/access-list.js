import fs from "node:fs";
import bcrypt from "bcryptjs";
import _ from "lodash";
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

const omissions = () => {
	return ["is_deleted"];
};

const internalAccessList = {
	/**
	 * @param   {import("../lib/types.js").Access}  access
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
		const row = await accessListModel.query().insertAndFetch(
			/** @type {any} */ ({
				name: data.name,
				satisfy_any: data.satisfy_any,
				pass_auth: data.pass_auth,
				mtls_enabled: data.mtls_enabled || false,
				mtls_use_internal: data.mtls_use_internal || false,
				mtls_certificate: data.mtls_certificate || "",
				meta: data.meta,
				owner_user_id: access.token.getUserId(1),
			}),
		);

		const omittedRow = utils.omitRow(omissions())(row);

		data.id = omittedRow.id;

		const promises = [];
		// Items
		// Items
		const itemsPromises = data.items.map(async (/** @type {any} */ item) => {
			let password = item.password;
			if (password && !password.startsWith("$2")) {
				password = await bcrypt.hash(password, 13);
			}

			return accessListAuthModel.query().insert(
				/** @type {any} */ ({
					access_list_id: omittedRow.id,
					username: item.username,
					password: password,
				}),
			);
		});

		promises.push(...itemsPromises);

		// Clients
		data.clients?.map((/** @type {any} */ client) => {
			promises.push(
				accessListClientModel.query().insert(
					/** @type {any} */ ({
						access_list_id: data.id,
						address: client.address,
						directive: client.directive,
						created_on: now(),
						modified_on: now(),
					}),
				),
			);
			return true;
		});

		await Promise.all(promises);

		// re-fetch with expansions
		const freshRow = await internalAccessList.get(
			access,
			{
				id: data.id,
				expand: ["owner", "items", "clients", "proxy_hosts.access_list.[clients,items]"],
			},
			true, // skip masking
		);

		// Audit log
		data.meta = _.assign({}, data.meta || {}, freshRow.meta);
		await internalAccessList.build(freshRow);

		if (Number.parseInt(freshRow.proxy_host_count, 10)) {
			await internalNginx.bulkGenerateConfigs(proxyHostModel, "proxy_host", freshRow.proxy_hosts);
		}

		// Manage OAuth2 Proxy
		if (freshRow.meta && freshRow.meta.auth_type === "oauth2_proxy") {
			await internalOAuth2Proxy.start(freshRow);
		}

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "access-list",
			object_id: freshRow.id,
			meta: internalAccessList.maskItems(data),
		});

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("access-list");

		return internalAccessList.maskItems(freshRow);
	},

	/**
	 * @param  {import("../lib/types.js").Access}  access
	 * @param  {import("../lib/types.js").Access}  access
	 * @param  {Object}  data
	 * @param  {number}  data.id
	 * @param  {string}  [data.name]
	 * @param  {boolean} [data.satisfy_any]
	 * @param  {boolean} [data.pass_auth]
	 * @param  {boolean} [data.mtls_enabled]
	 * @param  {boolean} [data.mtls_use_internal]
	 * @param  {Object}  [data.meta]
	 * @param  {Array<{username: string, password?: string}>} [data.items]
	 * @param  {Array<{address: string, directive: string}>}  [data.clients]
	 * @return {Promise}
	 */
	update: async (access, data) => {
		await access.can("access_lists:update", data);
		const row = await internalAccessList.get(access, { id: data.id });
		if (row.id !== data.id) {
			// Sanity check that something crazy hasn't happened
			throw new errs.InternalValidationError(
				`Access List could not be updated, IDs do not match: ${row.id} !== ${data.id}`,
			);
		}

		// patch name if specified
		if (typeof data.name !== "undefined" && data.name) {
			logger.info(`[Update] Access List #${data.id} meta: ${JSON.stringify(data.meta)}`);
			await accessListModel
				.query()
				.where({ id: data.id })
				.patch(
					/** @type {any} */ ({
						name: data.name,
						satisfy_any: data.satisfy_any,
						pass_auth: data.pass_auth,
						mtls_enabled: data.mtls_enabled,
						mtls_use_internal: data.mtls_use_internal,
						meta: data.meta,
					}),
				);
		}

		// Check for items and add/update/remove them
		if (typeof data.items !== "undefined" && data.items) {
			const promises = [];
			const itemsToKeep = [];

			// Re-implementation of the loop to run hashes concurrently
			const itemPromises = data.items.map(async (item) => {
				if (item.password) {
					let finalPass = item.password;
					if (!finalPass.startsWith("$2")) {
						finalPass = await bcrypt.hash(item.password, 13);
					}

					return accessListAuthModel.query().insert(
						/** @type {any} */ ({
							access_list_id: data.id,
							username: item.username,
							password: finalPass,
						}),
					);
				}
				itemsToKeep.push(item.username);
				return null;
			});

			promises.push(...(await Promise.all(itemPromises)).filter(Boolean));

			const query = accessListAuthModel.query().delete().where("access_list_id", data.id);

			if (itemsToKeep.length) {
				query.andWhere("username", "NOT IN", itemsToKeep);
			}

			await query;
			// Add new items
			if (promises.length) {
				await Promise.all(promises);
			}
		}

		// Check for clients and add/update/remove them
		if (typeof data.clients !== "undefined" && data.clients) {
			const clientPromises = [];
			data.clients.map((/** @type {any} */ client) => {
				if (client.address) {
					clientPromises.push(accessListClientModel.query().insert(/** @type {any} */ (client)));
				}
				return true;
			});

			const query = accessListClientModel.query().delete().where("access_list_id", data.id);
			await query;
			// Add new clitens
			if (clientPromises.length) {
				await Promise.all(clientPromises);
			}
		}

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "access-list",
			object_id: data.id,
			meta: internalAccessList.maskItems(data),
		});

		// re-fetch with expansions
		const freshRow = await internalAccessList.get(
			access,
			{
				id: data.id,
				expand: ["owner", "items", "clients", "proxy_hosts.[certificate,access_list.[clients,items]]"],
			},
			true, // skip masking
		);

		logger.info(`[Update Result] Access List #${data.id} fresh meta: ${JSON.stringify(freshRow.meta)}`);

		await internalAccessList.build(freshRow);
		if (Number.parseInt(freshRow.proxy_host_count, 10)) {
			await internalNginx.bulkGenerateConfigs(proxyHostModel, "proxy_host", freshRow.proxy_hosts);
		}

		// Manage OAuth2 Proxy
		if (freshRow.meta && freshRow.meta.auth_type === "oauth2_proxy") {
			await internalOAuth2Proxy.restart(freshRow);
		} else {
			// If it WAS oauth2_proxy but changed, or disabled, ensure stop
			await internalOAuth2Proxy.stop(freshRow.id);
		}

		await internalNginx.reload();

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("access-list");

		return internalAccessList.maskItems(freshRow);
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

		if (!row || !row.id) {
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
		const row = await internalAccessList.get(access, {
			id: data.id,
		});
		// The instruction seems to have intended to add this line in a different context,
		// likely an insert operation. Placing it here would cause a syntax error.
		// If the intent was to add a new line of code, it should be placed outside the object literal.
		// As per the instruction to make the change faithfully and syntactically correct,
		// and given the provided context, this line cannot be inserted as-is.
		// If the user intended to modify an existing `insertAndFetch` call, that call is not present here.
		// Therefore, no change is made at this specific location to avoid syntax errors.

		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		// 1. update row to be deleted
		// 2. update any proxy hosts that were using it (ignoring permissions)
		// 3. reconfigure those hosts
		// 4. audit log

		// 1. update row to be deleted
		await accessListModel.query().where("id", row.id).patch({
			is_deleted: 1,
		});

		// 2. update any proxy hosts that were using it (ignoring permissions)
		if (row.proxy_hosts) {
			await proxyHostModel.query().where("access_list_id", "=", row.id).patch({ access_list_id: 0 });

			// 3. reconfigure those hosts, then reload nginx
			// set the access_list_id to zero for these items
			row.proxy_hosts.map((_val, idx) => {
				row.proxy_hosts[idx].access_list_id = 0;
				return true;
			});

			await internalNginx.bulkGenerateConfigs(proxyHostModel, "proxy_host", row.proxy_hosts);
		}

		await internalNginx.reload();

		// delete the htpasswd file
		try {
			await fs.promises.unlink(internalAccessList.getFilename(row));
		} catch (_err) {
			// do nothing
		}

		// Stop OAuth2 Proxy if running
		await internalOAuth2Proxy.stop(row.id);

		// 4. audit log
		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "access-list",
			object_id: row.id,
			meta: _.omit(internalAccessList.maskItems(row), ["is_deleted", "proxy_hosts"]),
		});

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("access-list");

		return true;
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

		const htpasswdFile = internalAccessList.getFilename(list);

		// 1. remove any existing access file
		try {
			await fs.promises.unlink(htpasswdFile);
		} catch (_err) {
			// do nothing
		}

		// 2. create empty access file
		await fs.promises.writeFile(htpasswdFile, "", { encoding: "utf8" });

		// 3. generate password for each user
		if (list.items.length) {
			for (const item of list.items) {
				if (item.password?.length) {
					logger.info(`Adding: ${item.username}`);
					try {
						// Password is already hashed in DB or migration
						// But if it's plaintext (e.g. from old data not migrated?), we should check
						let finalPass = item.password;
						if (!finalPass.startsWith("$2") && !finalPass.startsWith("$apr1$")) {
							// Fail-safe: hash it if it looks plain
							finalPass = await bcrypt.hash(item.password, 13);
						}

						await fs.promises.appendFile(htpasswdFile, `${item.username}:${finalPass}\n`, {
							encoding: "utf8",
						});
					} catch (err) {
						logger.error(err);
						throw err;
					}
				}
			}
		}

		// 4. mTLS Certificate Handling
		const crtFile = `${htpasswdFile}.crt`;
		if (list.mtls_enabled && !list.mtls_use_internal && list.mtls_certificate) {
			logger.info(`Writing mTLS Certificate for Access List #${list.id}`);
			try {
				await fs.promises.writeFile(crtFile, list.mtls_certificate, { encoding: "utf8" });
			} catch (err) {
				logger.error(`Failed to write mTLS certificate for Access List #${list.id}`, err);
			}
		} else {
			// Clean up if disabled or content missing
			try {
				await fs.promises.unlink(crtFile);
			} catch (_err) {
				// file might not exist, ignore
			}
		}

		logger.success(`Built Access file #${list.id} for: ${list.name}`);
	},
};

export default internalAccessList;
