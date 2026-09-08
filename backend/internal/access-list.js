import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { isIP } from "node:net";
import bcrypt from "bcryptjs";
import _ from "lodash";
import errs from "../lib/error.js";
import { sanitizeProxyHost } from "../lib/host-response.js";
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

const isBcryptHash = (password) => /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(password);

const auditData = (list) =>
	_.omit(internalAccessList.maskItems(_.cloneDeep(list)), [
		"meta.oauth2_client_secret",
		"meta.oauth2_cookie_secret",
		"meta.oidc_client_secret",
	]);

const validateListInput = (data) => {
	const meta = data.meta || {};
	for (const field of [
		"authentik_host",
		"oauth2_proxy_prefix",
		"oauth2_provider",
		"oauth2_client_id",
		"oauth2_client_secret",
		"oauth2_cookie_secret",
		"oauth2_oidc_issuer_url",
		"oauth2_scope",
		"oauth2_allowed_groups",
		"oauth2_allowed_emails",
		"oauth2_allowed_email_domains",
		"oidc_discovery_url",
		"oidc_client_id",
		"oidc_client_secret",
	]) {
		if (meta[field] != null && typeof meta[field] !== "string") {
			throw new errs.ValidationError(`Access-list ${field} must be a string`);
		}
	}
	if (meta.auth_type && !["basic", "authentik_proxy", "oauth2_proxy", "oidc"].includes(meta.auth_type)) {
		throw new errs.ValidationError("Invalid access-list authentication type");
	}
	if (meta.authentik_host) {
		let url;
		try {
			url = new URL(meta.authentik_host);
		} catch {
			/* Report a validation error below. */
		}
		if (!url || !["http:", "https:"].includes(url.protocol) || /[\s;{}"'\\$#]/.test(meta.authentik_host)) {
			throw new errs.ValidationError("Authentik host must be an HTTP(S) URL without Nginx directives");
		}
	}
	if (meta.oauth2_proxy_prefix && !/^\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\/?$/.test(meta.oauth2_proxy_prefix)) {
		throw new errs.ValidationError("OAuth2 proxy prefix must be an absolute URL path");
	}
	const usernames = new Set();
	for (const item of data.items || []) {
		if (typeof item.username !== "string" || !/^[^:\r\n\0]+$/.test(item.username)) {
			throw new errs.ValidationError("Access-list usernames cannot be empty or contain colons or line breaks");
		}
		if (usernames.has(item.username)) {
			throw new errs.ValidationError("Access-list usernames must be unique");
		}
		usernames.add(item.username);
	}
	for (const client of data.clients || []) {
		if (!["allow", "deny"].includes(client.directive) || typeof client.address !== "string") {
			throw new errs.ValidationError("Invalid access-list client rule");
		}
		if (client.address === "all") {
			continue;
		}
		const parts = client.address.split("/");
		const family = isIP(parts[0]);
		if (
			!family ||
			parts.length > 2 ||
			(parts.length === 2 && (!/^\d+$/.test(parts[1]) || Number(parts[1]) > (family === 4 ? 32 : 128)))
		) {
			throw new errs.ValidationError("Access-list client addresses must be IP addresses, CIDR ranges, or all");
		}
	}
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
		validateListInput(data);
		const row = await accessListModel.transaction(async (trx) => {
			const created = await accessListModel.query(trx).insertAndFetch(
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

			for (const item of data.items || []) {
				let password = item.password;
				if (password && !isBcryptHash(password)) {
					password = await bcrypt.hash(password, 13);
				}

				await accessListAuthModel.query(trx).insert(
					/** @type {any} */ ({
						access_list_id: created.id,
						username: item.username,
						password: password,
					}),
				);
			}

			// Clients
			for (const client of data.clients || []) {
				await accessListClientModel.query(trx).insert(
					/** @type {any} */ ({
						access_list_id: created.id,
						address: client.address,
						directive: client.directive,
						created_on: now(),
						modified_on: now(),
					}),
				);
			}
			return created;
		});
		data.id = row.id;

		// re-fetch with expansions
		const freshRow = await internalAccessList.get(
			access,
			{
				id: data.id,
				expand: [
					"owner",
					"items",
					"clients",
					"proxy_hosts.[host_domains,certificate,access_list.[clients,items]]",
				],
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
			meta: auditData(data),
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
	 * @param  {Array<{address: string, directive: "allow" | "deny"}>}  [data.clients]
	 * @return {Promise}
	 */
	update: async (access, data) => {
		await access.can("access_lists:update", data);
		validateListInput(data);
		const row = await internalAccessList.get(access, { id: data.id });
		if (row.id !== data.id) {
			// Sanity check that something crazy hasn't happened
			throw new errs.InternalValidationError(
				`Access List could not be updated, IDs do not match: ${row.id} !== ${data.id}`,
			);
		}

		// Keep configuration, credentials and client rules consistent on failure.
		await accessListModel.transaction(async (trx) => {
			const patch = _.pick(data, [
				"name",
				"satisfy_any",
				"pass_auth",
				"mtls_enabled",
				"mtls_use_internal",
				"mtls_certificate",
				"meta",
			]);
			if (Object.keys(patch).length) {
				await accessListModel.query(trx).where({ id: data.id }).patch(patch);
			}

			// Check for items and add/update/remove them
			if (Array.isArray(data.items)) {
				const itemsToKeep = data.items.filter((item) => !item.password).map((item) => item.username);
				const replacements = await Promise.all(
					data.items
						.filter((item) => item.password)
						.map(async (item) => ({
							access_list_id: data.id,
							username: item.username,
							password: isBcryptHash(item.password)
								? item.password
								: await bcrypt.hash(item.password, 13),
						})),
				);

				// 1. First delete credentials that are removed or replaced.
				const query = accessListAuthModel.query(trx).delete().where("access_list_id", data.id);
				if (itemsToKeep.length) {
					query.whereNotIn("username", itemsToKeep);
				}
				await query;

				// 2. Then insert replacements and await every write before rebuilding.
				for (const item of replacements) {
					await accessListAuthModel.query(trx).insert(item);
				}
			}

			// Check for clients and add/update/remove them
			if (Array.isArray(data.clients)) {
				await accessListClientModel.query(trx).delete().where("access_list_id", data.id);
				for (const client of data.clients) {
					if (client.address) {
						await accessListClientModel.query(trx).insert({
							access_list_id: data.id,
							address: client.address,
							directive: client.directive,
						});
					}
				}
			}
		});

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "access-list",
			object_id: data.id,
			meta: auditData(data),
		});

		// re-fetch with expansions
		const freshRow = await internalAccessList.get(
			access,
			{
				id: data.id,
				expand: [
					"owner",
					"items",
					"clients",
					"proxy_hosts.[host_domains,certificate,access_list.[clients,items]]",
				],
			},
			true, // skip masking
		);

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

		await internalNginx.withConfigurationLock(() => internalNginx.reload());

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
			.allowGraph("[owner,items,clients,proxy_hosts.[host_domains,certificate,access_list.[clients,items]]]")
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

		if (!skipMasking) {
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
		const row = await internalAccessList.get(
			access,
			{
				id: data.id,
				expand: ["proxy_hosts.[host_domains,certificate]"],
			},
			true,
		);

		if (!row?.id) {
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

		await internalNginx.withConfigurationLock(() => internalNginx.reload());

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
			meta: _.omit(auditData(row), ["is_deleted", "proxy_hosts"]),
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
		if (Array.isArray(list?.items)) {
			list.items.map((_val, idx) => {
				list.items[idx].hint = "********";
				list.items[idx].password = "";
				return true;
			});
		}
		for (const host of list?.proxy_hosts || []) {
			if (host.access_list) {
				internalAccessList.maskItems(host.access_list);
			}
		}
		if (Array.isArray(list?.proxy_hosts)) {
			list.proxy_hosts = list.proxy_hosts.map(sanitizeProxyHost);
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

		// Assemble first, then atomically replace: readers never see a partial htpasswd file.
		const lines = [];
		for (const item of list.items || []) {
			if (!item.password) continue;
			let finalPass = item.password;
			if (!isBcryptHash(finalPass) && !/^\$apr1\$[./A-Za-z0-9]{1,8}\$[./A-Za-z0-9]{22}$/.test(finalPass)) {
				finalPass = await bcrypt.hash(finalPass, 13);
			}
			lines.push(`${item.username}:${finalPass}\n`);
		}
		const temporaryFile = `${htpasswdFile}.${randomUUID()}.tmp`;
		try {
			await fs.promises.writeFile(temporaryFile, lines.join(""), { encoding: "utf8", mode: 0o600 });
			await fs.promises.rename(temporaryFile, htpasswdFile);
		} finally {
			await fs.promises.rm(temporaryFile, { force: true });
		}

		// mTLS write errors must abort the update instead of silently retaining an old CA.
		const crtFile = `${htpasswdFile}.crt`;
		if (list.mtls_enabled && !list.mtls_use_internal && list.mtls_certificate) {
			const temporaryCrt = `${crtFile}.${randomUUID()}.tmp`;
			try {
				await fs.promises.writeFile(temporaryCrt, list.mtls_certificate, { encoding: "utf8", mode: 0o600 });
				await fs.promises.rename(temporaryCrt, crtFile);
			} finally {
				await fs.promises.rm(temporaryCrt, { force: true });
			}
		} else {
			await fs.promises.rm(crtFile, { force: true });
		}

		logger.success(`Built Access file #${list.id} for: ${list.name}`);
	},
};

export default internalAccessList;
