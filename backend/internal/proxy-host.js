import _ from "lodash";
import { encrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import utils from "../lib/utils.js";
import proxyHostModel from "../models/proxy_host.js";
import internalAuditLog from "./audit-log.js";
import internalCertificate from "./certificate.js";
import internalGitDeploy from "./git-deploy.js";
import internalGitOps from "./gitops.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";

const omissions = () => {
	return ["is_deleted", "owner.is_deleted"];
};

const internalProxyHost = {
	/**
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Object}  data
	 * @param   {Array<string>} data.domain_names
	 * @param   {string}  data.forward_scheme
	 * @param   {string}  data.forward_host
	 * @param   {number}  data.forward_port
	 * @param   {number}  [data.access_list_id]
	 * @param   {number|string}  [data.certificate_id]
	 * @param   {boolean} [data.ssl_forced]
	 * @param   {boolean} [data.hsts_enabled]
	 * @param   {boolean} [data.hsts_subdomains]
	 * @param   {boolean} [data.http2_support]
	 * @param   {boolean} [data.block_exploits]
	 * @param   {boolean} [data.caching_enabled]
	 * @param   {boolean} [data.allow_websocket_upgrade]
	 * @param   {string}  [data.advanced_config]
	 * @param   {Object}  [data.meta]
	 * @param   {Array<Object>} [data.locations]
	 * @param   {number}  [data.owner_user_id]
	 * @param   {string}  [data.git_repo_url]
	 * @param   {string}  [data.git_branch]
	 * @param   {boolean} [data.git_sync_enabled]
	 * @param   {number}  [data.git_poll_interval]
	 * @param   {string}  [data.git_poll_unit]
	 * @param   {string}  [data.git_credentials]
	 * @param   {string}  [data.terminal_password]
	 * @param   {string}  [data.terminal_private_key]
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		let thisData = data;
		const createCertificate = thisData.certificate_id === "new";

		if (createCertificate) {
			delete thisData.certificate_id;
		}

		await access.can("proxy_hosts:create", thisData);

		// Get a list of the domain names and check each of them against existing records
		const domain_name_check_promises = [];

		thisData.domain_names.map((domain_name) => {
			domain_name_check_promises.push(internalHost.isHostnameTaken(domain_name));
			return true;
		});

		const check_results = await Promise.all(domain_name_check_promises);
		check_results.map((result) => {
			if (result.is_taken) {
				throw new errs.ValidationError(`${result.hostname} is already in use`);
			}
			return true;
		});

		// At this point the domains should have been checked
		thisData.owner_user_id = access.token.getUserId(1);
		thisData = internalHost.cleanSslHstsData(createCertificate, thisData);

		// Fix for db field not having a default value
		// for this optional field.
		if (typeof thisData.advanced_config === "undefined") {
			thisData.advanced_config = "";
		}

		// Encrypt terminal credentials if present
		if (thisData.forward_scheme === "terminal") {
			if (thisData.terminal_password) {
				thisData.terminal_password = encrypt(thisData.terminal_password);
			}
			if (thisData.terminal_private_key) {
				thisData.terminal_private_key = encrypt(thisData.terminal_private_key);
			}
		}

		let row = await proxyHostModel.query().insertAndFetch(/** @type {any} */ (thisData));
		row = utils.omitRow(omissions())(row);

		if (createCertificate) {
			const cert = await internalCertificate.createQuickCertificate(access, thisData);
			// update host with cert id
			await internalProxyHost.update(access, {
				id: row.id,
				certificate_id: cert.id,
			});
		}

		// re-fetch with cert
		row = await internalProxyHost.get(access, {
			id: row.id,
			expand: ["certificate", "owner", "access_list.[clients,items]"],
		});

		// Configure nginx
		await internalNginx.configure(proxyHostModel, "proxy_host", row);

		// Audit log
		thisData.meta = _.assign({}, thisData.meta || {}, row.meta);

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "proxy-host",
			object_id: row.id,
			meta: thisData,
		});

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("proxy-host");

		// Start Git Deploy polling if enabled
		if (row.git_sync_enabled && row.git_repo_url) {
			internalGitDeploy.startPollingForHost(row);
		}

		return row;
	},

	/**
	 * @param  {import("../lib/types.js").Access}  access
	 * @param  {Object}  data
	 * @param  {number}  data.id
	 * @param  {Array<string>} [data.domain_names]
	 * @param  {string}  [data.forward_scheme]
	 * @param  {string}  [data.forward_host]
	 * @param  {number}  [data.forward_port]
	 * @param  {number}  [data.access_list_id]
	 * @param  {number|string}  [data.certificate_id]
	 * @param  {boolean} [data.ssl_forced]
	 * @param  {boolean} [data.hsts_enabled]
	 * @param  {boolean} [data.hsts_subdomains]
	 * @param  {boolean} [data.http2_support]
	 * @param  {boolean} [data.block_exploits]
	 * @param  {boolean} [data.caching_enabled]
	 * @param  {boolean} [data.allow_websocket_upgrade]
	 * @param  {string}  [data.advanced_config]
	 * @param  {Object}  [data.meta]
	 * @param  {Array<Object>} [data.locations]
	 * @param  {string}  [data.git_repo_url]
	 * @param  {string}  [data.git_branch]
	 * @param  {boolean} [data.git_sync_enabled]
	 * @param  {number}  [data.git_poll_interval]
	 * @param  {string}  [data.git_poll_unit]
	 * @param  {string}  [data.git_credentials]
	 * @param  {string}  [data.terminal_password]
	 * @param  {string}  [data.terminal_private_key]
	 * @return {Promise}
	 */
	update: async (access, data) => {
		let thisData = data;
		const create_certificate = thisData.certificate_id === "new";

		if (create_certificate) {
			delete thisData.certificate_id;
		}

		await access.can("proxy_hosts:update", thisData.id);

		// Get a list of the domain names and check each of them against existing records
		const domain_name_check_promises = [];

		if (typeof thisData.domain_names !== "undefined") {
			thisData.domain_names.map((domain_name) => {
				return domain_name_check_promises.push(internalHost.isHostnameTaken(domain_name, "proxy", thisData.id));
			});

			const check_results = await Promise.all(domain_name_check_promises);
			check_results.map((result) => {
				if (result.is_taken) {
					throw new errs.ValidationError(`${result.hostname} is already in use`);
				}
				return true;
			});
		}

		let row = await internalProxyHost.get(access, { id: thisData.id });

		if (row.id !== thisData.id) {
			// Sanity check that something crazy hasn't happened
			throw new errs.InternalValidationError(
				`Proxy Host could not be updated, IDs do not match: ${row.id} !== ${thisData.id}`,
			);
		}

		if (create_certificate) {
			const cert = await internalCertificate.createQuickCertificate(access, {
				domain_names: thisData.domain_names || row.domain_names,
				meta: _.assign({}, row.meta, thisData.meta),
			});
			// update host with cert id
			thisData.certificate_id = cert.id;
		}

		// Add domain_names to the data in case it isn't there, so that the audit log renders correctly. The order is important here.
		thisData = _.assign(
			{},
			{
				domain_names: row.domain_names,
			},
			data,
		);

		thisData = internalHost.cleanSslHstsData(create_certificate, thisData, row);

		if (data.git_credentials) {
			thisData.git_credentials = encrypt(data.git_credentials);
		} else if (typeof data.git_credentials !== "undefined" && data.git_credentials === "") {
			// Empty string means preserve existing credentials (do not update)
			delete thisData.git_credentials;
		}

		// Encrypt terminal credentials if present (on update)
		if (data.terminal_password) {
			thisData.terminal_password = encrypt(data.terminal_password);
		}
		if (data.terminal_private_key) {
			thisData.terminal_private_key = encrypt(data.terminal_private_key);
		}

		let _saved_row = await proxyHostModel
			.query()
			.where({ id: thisData.id })
			.patch(/** @type {any} */ (thisData));

		// fetch updated row to be safe and consistent with previous logic if patch returns count
		// wait, patch returns count. We need to fetch it or rely on logic.
		// The original code was: .patch(thisData).then(utils.omitRow(omissions()))
		// But .patch() usually returns number of affected rows in Objection.js unless .returning('*') is used (PG only).
		// Wait, the original code had: .patch(thisData).then(utils.omitRow(omissions()))
		// If patch returns a number, omitRow will crash or return garbage.
		// Let's check existing usage. `proxyHostModel.query().where(...).patch(...)` returns count.
		// So `utils.omitRow` on a count (number) is weird.
		// Ah, `utils.omitRow` does `_.omit(row, omissions)`. If row is a number, `_.omit` returns `{}`.
		// So the previous code might have been returning `{}` which is WRONG.
		// UNLESS `patchAndFetchById` was used? No, it was `patch`.

		// Let's double check `backend/internal/proxy-host.js` old content.
		// `.patch(thisData).then(utils.omitRow(omissions())).then((saved_row) => { ... })`
		// If `saved_row` was `{}`, then `return saved_row` at the end would return empty object.

		// Actually, I should use `patchAndFetchById` if I want the row, or just `patch` and then `get`.
		// But since we are updating by ID, `patchAndFetchById` is best.
		// But wait, the original code used `proxyHostModel.query().where({ id: thisData.id }).patch(thisData)`.
		// This is definitely returning a count in SQLite/MySQL.

		// Let's assume I should fetch the row again or return `row` with merged data.
		// But for safety, I will use `patchAndFetchById`.

		const new_saved_row = /** @type {any} */ (
			await proxyHostModel.query().patchAndFetchById(thisData.id, /** @type {any} */ (thisData))
		);
		_saved_row = utils.omitRow(omissions())(new_saved_row);

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "proxy-host",
			object_id: row.id,
			meta: thisData,
		});

		row = await internalProxyHost.get(access, {
			id: thisData.id,
			expand: ["owner", "certificate", "access_list.[clients,items]"],
		});

		if (!row.enabled) {
			// No need to add nginx config if host is disabled
			return row;
		}

		// Configure nginx
		const new_meta = await internalNginx.configure(proxyHostModel, "proxy_host", row);
		row.meta = new_meta;

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("proxy-host");

		// Restart Git Deploy polling
		internalGitDeploy.startPollingForHost(row);

		return _.omit(internalHost.cleanRowCertificateMeta(row), omissions());
	},

	/**
	 * @param  {import("../lib/types.js").Access}   access
	 * @param  {Object}   data
	 * @param  {Number}   data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise}
	 */
	get: async (access, data) => {
		const thisData = /** @type {any} */ (data || {});

		const access_data = await access.can("proxy_hosts:get", thisData.id);

		const query = proxyHostModel
			.query()
			.where("is_deleted", 0)
			.andWhere("id", thisData.id)
			.allowGraph("[owner,access_list.[clients,items],certificate]")
			.first();

		if (access_data.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
			query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
		}

		let row = await query;
		row = utils.omitRow(omissions())(row);

		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(thisData.id);
		}
		const thisRow = internalHost.cleanRowCertificateMeta(row);
		// Custom omissions
		if (typeof thisData.omit !== "undefined" && thisData.omit !== null) {
			return _.omit(row, thisData.omit);
		}
		return thisRow;
	},

	/**
	 * @param {import("../lib/types.js").Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	delete: async (access, data) => {
		await access.can("proxy_hosts:delete", data.id);
		const row = await internalProxyHost.get(access, { id: data.id });

		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		await proxyHostModel
			.query()
			.where("id", row.id)
			.patch(
				/** @type {any} */ ({
					is_deleted: 1,
				}),
			);

		// Delete Nginx Config
		await internalNginx.deleteConfig("proxy_host", /** @type {any} */ (row));
		await internalNginx.reload();

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "proxy-host",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("proxy-host");

		// Stop Git Deploy polling
		internalGitDeploy.stopPolling(data.id);

		return true;
	},

	/**
	 * @param {import("../lib/types.js").Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	enable: async (access, data) => {
		await access.can("proxy_hosts:update", data.id);
		const row = await internalProxyHost.get(access, {
			id: data.id,
			expand: ["certificate", "owner", "access_list"],
		});

		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		if (row.enabled) {
			throw new errs.ValidationError("Host is already enabled");
		}

		row.enabled = 1;

		await proxyHostModel.query().where("id", row.id).patch({
			enabled: 1,
		});

		// Configure nginx
		await internalNginx.configure(proxyHostModel, "proxy_host", row);

		// Start Git Deploy polling if enabled
		if (row.git_sync_enabled && row.git_repo_url) {
			internalGitDeploy.startPollingForHost(row);
		}

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "enabled",
			object_type: "proxy-host",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});

		return true;
	},

	/**
	 * @param {import("../lib/types.js").Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	disable: async (access, data) => {
		await access.can("proxy_hosts:update", data.id);
		const row = await internalProxyHost.get(access, { id: data.id });

		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		if (!row.enabled) {
			throw new errs.ValidationError("Host is already disabled");
		}

		row.enabled = 0;

		await proxyHostModel.query().where("id", row.id).patch({
			enabled: 0,
		});

		// Delete Nginx Config
		await internalNginx.deleteConfig("proxy_host", row);
		await internalNginx.reload();

		// Stop Git Deploy polling
		internalGitDeploy.stopPolling(data.id);

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "disabled",
			object_type: "proxy-host",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});

		return true;
	},

	/**
	 * All Hosts
	 *
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [search_query]
	 * @param   {Object}  [pagination]
	 * @param   {number}  [pagination.page]
	 * @param   {number}  [pagination.limit]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, search_query, pagination) => {
		const accessData = await access.can("proxy_hosts:list");
		const query = proxyHostModel
			.query()
			.where("is_deleted", 0)
			.groupBy("id")
			.allowGraph("[owner,access_list,certificate]")
			.orderBy(castJsonIfNeed("domain_names"), "ASC");

		if (accessData.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		// Query is used for searching
		if (typeof search_query === "string" && search_query !== "") {
			query.where(function () {
				this.where("domain_names", "like", `%${search_query}%`);
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		// Pagination
		let total = 0;
		if (pagination && pagination.limit) {
			const countQuery = query.clone().resultSize();
			total = await countQuery;
			query.page(pagination.page > 0 ? pagination.page - 1 : 0, pagination.limit);
		}

		const result = await query;
		let rows = result;
		if (pagination && pagination.limit) {
			rows = result.results;
		}

		// return rows with count
		if (rows) {
			rows.map((row) => {
				row.access_list_id = Number.parseInt(String(row.access_list_id), 10);
				// @ts-expect-error
				row.connected_tunnels = /** @type {any} */ (row).count || 0;
				// @ts-expect-error
				delete row.count;
				return row;
			});
		}

		if (pagination && pagination.limit) {
			return {
				data: rows,
				pagination: {
					page: pagination.page,
					limit: pagination.limit,
					total: total,
				},
			};
		}

		return rows;
	},

	/**
	 * Report use
	 *
	 * @param   {Number}  user_id
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: async (user_id, visibility) => {
		const query = proxyHostModel.query().count("id as count").where("is_deleted", 0);

		if (visibility !== "all") {
			query.andWhere("owner_user_id", user_id);
		}

		const row = await query.first();
		return Number.parseInt(/** @type {any} */ (row).count, 10);
	},
};

export default internalProxyHost;
