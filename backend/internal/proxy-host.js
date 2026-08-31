import crypto from "node:crypto";
import _ from "lodash";
import { transaction } from "objection";
import { encrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import AccessList from "../models/access_list.js";
import HostDomain from "../models/host_domain.js";
import proxyHostModel from "../models/proxy_host.js";
import internalAuditLog from "./audit-log.js";
import internalCertificate from "./certificate.js";
import internalGitDeploy from "./git-deploy.js";
import internalGitOps from "./gitops.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";
import internalOAuth2Proxy from "./oauth2-proxy.js";
import internalTerminal from "./terminal.js";

const omissions = () => {
	return ["is_deleted", "owner.is_deleted", "terminal_password", "terminal_private_key", "terminal_gateway_secret"];
};

const omitSensitiveHostData = (data) =>
	_.omit(data, ["terminal_password", "terminal_private_key", "terminal_gateway_secret", "git_credentials"]);

const restoreProxySnapshot = async (snapshot) => {
	await transaction(proxyHostModel.knex(), async (trx) => {
		const rowData = _.omit(snapshot.row, ["id", "created_on", "modified_on", "host_domains", "domain_names"]);
		await proxyHostModel.query(trx).findById(snapshot.row.id).patch(rowData);
		await HostDomain.query(trx).delete().where("proxy_host_id", snapshot.row.id);
		for (const domain of snapshot.domains) {
			await HostDomain.query(trx).insert({ proxy_host_id: snapshot.row.id, domain_name: domain.domain_name });
		}
	});
};

const runtimeFailure = (message, error, rollbackResults) => {
	const failures = rollbackResults
		.filter((result) => result.status === "rejected")
		.map((result) => result.reason?.message || String(result.reason));
	return new errs.ConfigurationError(
		`${message}: ${error.message}${failures.length ? `; rollback errors: ${failures.join("; ")}` : ""}`,
		error,
	);
};

const escapeLike = (value) => value.replaceAll("!", "!!").replaceAll("%", "!%").replaceAll("_", "!_");

/**
 * Ensure OAuth2 Proxy is running for the given access_list_id (if it's an OAuth2-type list).
 * @param {number} accessListId
 */
const _ensureOAuth2Proxy = async (accessListId) => {
	if (!accessListId) return;
	try {
		const list = await AccessList.query().where("id", accessListId).where("is_deleted", 0).first();
		if (list?.meta && (list.meta.auth_type === "oauth2_proxy" || list.meta.authType === "oauth2_proxy")) {
			await internalOAuth2Proxy.start(list);
		}
	} catch (err) {
		// Non-fatal: log but don't block proxy host operation
		console.error(`[OAuth2Proxy] Error ensuring proxy for access list #${accessListId}:`, err);
	}
};

/**
 * Stop OAuth2 Proxy for the given access_list_id if no other active proxy host uses it.
 * @param {number} accessListId
 */
const _cleanupOAuth2Proxy = async (accessListId) => {
	if (!accessListId) return;
	try {
		const list = await AccessList.query().where("id", accessListId).where("is_deleted", 0).first();
		if (!list?.meta || (list.meta.auth_type !== "oauth2_proxy" && list.meta.authType !== "oauth2_proxy")) {
			return;
		}
		// Check if any other active proxy host still uses this access list
		const otherHosts = await proxyHostModel.query().where("access_list_id", accessListId).where("is_deleted", 0);
		if (otherHosts.length === 0) {
			await internalOAuth2Proxy.stop(accessListId);
		}
	} catch (err) {
		console.error(`[OAuth2Proxy] Error cleaning up proxy for access list #${accessListId}:`, err);
	}
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
	 * @param   {string}  [data.terminal_host]
	 * @param   {number}  [data.terminal_port]
	 * @param   {string}  [data.terminal_username]
	 * @param   {string}  [data.terminal_auth_type]
	 * @param   {string}  [data.terminal_host_key_fingerprint]
	 * @param   {Array<Object>} [data.host_domains]
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		let thisData = /** @type {any} */ (data);
		const createCertificate = thisData.certificate_id === "new";
		let createdCertificateId = null;

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
			await internalTerminal.validateHostConfiguration(thisData, { allowNewCertificate: createCertificate });
			thisData.terminal_gateway_secret = encrypt(crypto.randomBytes(32).toString("base64url"));
			if (thisData.terminal_auth_type === "password" && thisData.terminal_password) {
				thisData.terminal_password = encrypt(thisData.terminal_password);
				thisData.terminal_private_key = null;
			}
			if (thisData.terminal_auth_type === "key" && thisData.terminal_private_key) {
				thisData.terminal_private_key = encrypt(thisData.terminal_private_key);
				thisData.terminal_password = null;
			}
		}

		// Transform domain_names into host_domains relation objects for insertGraph
		if (thisData.domain_names && Array.isArray(thisData.domain_names)) {
			thisData.host_domains = thisData.domain_names.map((domain) => ({ domain_name: domain }));
		}

		let row = await proxyHostModel.query().insertGraphAndFetch(/** @type {any} */ (thisData));
		row = utils.omitRow(omissions())(row);

		if (createCertificate) {
			try {
				const cert = await internalCertificate.createQuickCertificate(access, thisData);
				createdCertificateId = cert.id;
				await proxyHostModel.query().findById(row.id).patch({ certificate_id: cert.id });
			} catch (error) {
				const rollbackResults = await Promise.allSettled([
					transaction(proxyHostModel.knex(), async (trx) => {
						await HostDomain.query(trx).delete().where("proxy_host_id", row.id);
						await proxyHostModel.query(trx).deleteById(row.id);
					}),
					createdCertificateId
						? internalCertificate.delete(access, { id: createdCertificateId })
						: Promise.resolve(),
				]);
				throw runtimeFailure("Proxy-host certificate creation failed", error, rollbackResults);
			}
		}

		// re-fetch with cert
		row = await internalProxyHost.get(access, {
			id: row.id,
			expand: ["certificate", "owner", "access_list.[clients,items]", "host_domains"],
		});

		// Configure nginx. A rejected runtime activation removes the newly created DB graph as compensation.
		try {
			await internalNginx.configure(proxyHostModel, "proxy_host", row);
		} catch (error) {
			const rollbackResults = await Promise.allSettled([
				transaction(proxyHostModel.knex(), async (trx) => {
					await HostDomain.query(trx).delete().where("proxy_host_id", row.id);
					await proxyHostModel.query(trx).deleteById(row.id);
				}),
				createdCertificateId
					? internalCertificate.delete(access, { id: createdCertificateId })
					: Promise.resolve(),
			]);
			throw runtimeFailure("Proxy-host creation failed", error, rollbackResults);
		}

		// Audit log
		thisData.meta = _.assign({}, thisData.meta || {}, row.meta);

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "proxy-host",
			object_id: row.id,
			meta: omitSensitiveHostData(thisData),
		});

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("proxy-host");

		// Start Git Deploy polling if enabled
		if (row.git_sync_enabled && row.git_repo_url) {
			internalGitDeploy.startPollingForHost(row);
		}

		// Start OAuth2 Proxy if needed
		await _ensureOAuth2Proxy(row.access_list_id);

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
	 * @param  {string}  [data.terminal_host]
	 * @param  {number}  [data.terminal_port]
	 * @param  {string}  [data.terminal_username]
	 * @param  {string}  [data.terminal_auth_type]
	 * @param  {string}  [data.terminal_host_key_fingerprint]
	 * @param  {Array<Object>} [data.host_domains]
	 * @return {Promise}
	 */
	update: async (access, data, options = {}) => {
		let thisData = /** @type {any} */ (data);
		const create_certificate = thisData.certificate_id === "new";
		let createdCertificateId = null;

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
		const storedRow = await proxyHostModel.query().findById(thisData.id).where("is_deleted", 0);
		const storedDomains = await HostDomain.query().where("proxy_host_id", thisData.id);
		const snapshot = { row: storedRow.toJSON(), domains: storedDomains.map((domain) => domain.toJSON()) };
		const oldAccessListId = row.access_list_id; // Save before update for OAuth2 Proxy lifecycle

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
			createdCertificateId = cert.id;
			// update host with cert id
			thisData.certificate_id = cert.id;
		}

		// Add domain_names to the data in case it isn't there, so that the audit log renders correctly. The order is important here.
		thisData = _.assign(
			{},
			{
				domain_names: row.domain_names,
			},
			thisData,
		);

		thisData = internalHost.cleanSslHstsData(create_certificate, thisData, row);

		if (data.git_credentials) {
			thisData.git_credentials = encrypt(data.git_credentials);
		} else if (typeof data.git_credentials !== "undefined" && data.git_credentials === "") {
			// Empty string means preserve existing credentials (do not update)
			delete thisData.git_credentials;
		}

		if (data.terminal_password && Buffer.byteLength(data.terminal_password, "utf8") > 4096) {
			throw new errs.ValidationError("Terminal passwords cannot exceed 4096 bytes");
		}
		if (data.terminal_private_key && Buffer.byteLength(data.terminal_private_key, "utf8") > 65536) {
			throw new errs.ValidationError("Terminal private keys cannot exceed 64 KiB");
		}

		// Encrypt terminal credentials if present (on update)
		if (data.terminal_password) {
			thisData.terminal_password = encrypt(data.terminal_password);
		} else if (data.terminal_password === "") {
			delete thisData.terminal_password;
		}
		if (data.terminal_private_key) {
			thisData.terminal_private_key = encrypt(data.terminal_private_key);
		} else if (data.terminal_private_key === "") {
			delete thisData.terminal_private_key;
		}

		const effectiveData = _.assign({}, storedRow, thisData);
		if (effectiveData.forward_scheme === "terminal" && !effectiveData.terminal_gateway_secret) {
			thisData.terminal_gateway_secret = encrypt(crypto.randomBytes(32).toString("base64url"));
			effectiveData.terminal_gateway_secret = thisData.terminal_gateway_secret;
		}
		await internalTerminal.validateHostConfiguration(effectiveData, { credentialsEncrypted: true });
		if (effectiveData.forward_scheme === "terminal") {
			if (effectiveData.terminal_auth_type === "password") thisData.terminal_private_key = null;
			if (effectiveData.terminal_auth_type === "key") thisData.terminal_password = null;
		} else if (storedRow.forward_scheme === "terminal") {
			Object.assign(thisData, {
				terminal_auth_type: null,
				terminal_gateway_secret: null,
				terminal_host: null,
				terminal_host_key_fingerprint: null,
				terminal_password: null,
				terminal_port: null,
				terminal_private_key: null,
				terminal_username: null,
			});
		}

		// Transform domain_names into host_domains relation objects for upsertGraph
		if (thisData.domain_names && Array.isArray(thisData.domain_names)) {
			thisData.host_domains = thisData.domain_names.map((domain) => ({ domain_name: domain }));
		}

		const new_saved_row = /** @type {any} */ (
			await proxyHostModel.query().upsertGraphAndFetch(/** @type {any} */ (thisData))
		);
		const _saved_row = utils.omitRow(omissions())(new_saved_row);
		await internalTerminal.revokeHost(row.id);

		row = await internalProxyHost.get(access, {
			id: thisData.id,
			expand: ["owner", "certificate", "access_list.[clients,items]", "host_domains"],
		});

		if (!options.skip_configure) {
			try {
				const new_meta = await internalNginx.configure(proxyHostModel, "proxy_host", row);
				row.meta = new_meta;
			} catch (error) {
				const rollbackResults = await Promise.allSettled([
					restoreProxySnapshot(snapshot),
					createdCertificateId
						? internalCertificate.delete(access, { id: createdCertificateId })
						: Promise.resolve(),
				]);
				if (rollbackResults[0].status === "fulfilled") {
					rollbackResults.push(
						...(await Promise.allSettled([
							(async () => {
								const restored = await internalProxyHost.get(access, {
									id: snapshot.row.id,
									expand: ["owner", "certificate", "access_list.[clients,items]", "host_domains"],
								});
								await internalNginx.configure(proxyHostModel, "proxy_host", restored);
							})(),
						])),
					);
				}
				throw runtimeFailure("Proxy-host update failed", error, rollbackResults);
			}
		}

		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "proxy-host",
			object_id: row.id,
			meta: omitSensitiveHostData(thisData),
		});

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("proxy-host");

		// Restart Git Deploy polling
		internalGitDeploy.startPollingForHost(row);

		// Handle OAuth2 Proxy lifecycle on access_list_id change
		if (row.access_list_id !== oldAccessListId) {
			// Start new OAuth2 Proxy if needed
			await _ensureOAuth2Proxy(row.access_list_id);
			// Stop old one if no longer used
			await _cleanupOAuth2Proxy(oldAccessListId);
		}

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
			.allowGraph("[owner,access_list.[clients,items],certificate,host_domains]")
			.withGraphFetched("host_domains")
			.first();

		if (access_data.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
			query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
		}

		let row = await query;
		row = utils.omitRow(omissions())(row);

		if (!row?.id) {
			throw new errs.ItemNotFoundError(thisData.id);
		}
		const thisRow = internalHost.cleanRowCertificateMeta(row);
		// SECURITY: Mask internal paths in forward_host from API responses
		if (thisRow.forward_host?.startsWith("/data/websites/")) {
			thisRow.forward_host = "(managed)";
		}
		// Custom omissions — must use thisRow (cleaned) not raw row to avoid leaking certificate private keys
		if (typeof thisData.omit !== "undefined" && thisData.omit !== null) {
			return _.omit(thisRow, thisData.omit);
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

		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		try {
			await proxyHostModel
				.query()
				.where("id", row.id)
				.patch(/** @type {any} */ ({ is_deleted: 1 }));
			await internalTerminal.revokeHost(row.id);
			await internalNginx.deleteConfig("proxy_host", /** @type {any} */ (row));
		} catch (error) {
			const rollbackResults = await Promise.allSettled([
				proxyHostModel
					.query()
					.where("id", row.id)
					.patch(/** @type {any} */ ({ is_deleted: 0 })),
			]);
			throw runtimeFailure("Proxy-host deletion failed", error, rollbackResults);
		}

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

		// Stop OAuth2 Proxy if this was the last host using it
		await _cleanupOAuth2Proxy(row.access_list_id);

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
			expand: ["certificate", "owner", "access_list.[clients,items]", "host_domains"],
		});

		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		if (row.enabled) {
			throw new errs.ValidationError("Host is already enabled");
		}

		const storedRow = await proxyHostModel.query().findById(row.id).where("is_deleted", 0);
		await internalTerminal.validateHostConfiguration({ ...storedRow, enabled: 1 });
		row.enabled = 1;

		try {
			await proxyHostModel.query().where("id", row.id).patch({ enabled: 1 });
			await internalTerminal.revokeHost(row.id);
			await internalNginx.configure(proxyHostModel, "proxy_host", row);
		} catch (error) {
			const rollbackResults = await Promise.allSettled([
				proxyHostModel.query().where("id", row.id).patch({ enabled: 0 }),
			]);
			throw runtimeFailure("Proxy-host enable failed", error, rollbackResults);
		}

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

		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		if (!row.enabled) {
			throw new errs.ValidationError("Host is already disabled");
		}

		row.enabled = 0;

		try {
			await proxyHostModel.query().where("id", row.id).patch({ enabled: 0 });
			await internalTerminal.revokeHost(row.id);
			await internalNginx.deleteConfig("proxy_host", row);
		} catch (error) {
			const rollbackResults = await Promise.allSettled([
				proxyHostModel.query().where("id", row.id).patch({ enabled: 1 }),
			]);
			throw runtimeFailure("Proxy-host disable failed", error, rollbackResults);
		}

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
	 * @param   {Number}  pagination.page
	 * @param   {Number}  pagination.limit
	 * @returns {Promise}
	 */
	getAll: async (access, expand, search_query, pagination) => {
		const accessData = await access.can("proxy_hosts:list");
		const query = proxyHostModel
			.query()
			.where("is_deleted", 0)
			.groupBy("id")
			.allowGraph("[owner,access_list,certificate,host_domains]")
			.withGraphFetched("[host_domains, certificate, access_list]")
			.orderBy("id", "DESC"); // Order by id DESC since domain_names is no longer a simple column

		if (accessData.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		// Keep the server-side search semantics aligned with the table's domain and upstream-host filters.
		if (typeof search_query === "string") {
			const searchPattern = `%${escapeLike(search_query)}%`;
			query.where((searchConditions) => {
				searchConditions
					.whereExists(
						proxyHostModel
							.relatedQuery("host_domains")
							.whereRaw("?? LIKE ? ESCAPE '!'", ["domain_name", searchPattern]),
					)
					.orWhereRaw("?? LIKE ? ESCAPE '!'", ["forward_host", searchPattern]);

				if (/^\d+$/.test(search_query)) {
					searchConditions.orWhere("forward_port", Number(search_query));
				}
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		const pageResult = pagination ? await query.page(pagination.page - 1, pagination.limit) : null;
		const rows = pageResult ? pageResult.results : await query;

		// return rows with count
		if (rows) {
			rows.map((row) => {
				row.access_list_id = Number.parseInt(String(row.access_list_id), 10);
				// @ts-expect-error
				row.connected_tunnels = /** @type {any} */ (row).count || 0;
				// @ts-expect-error
				delete row.count;
				// SECURITY: Mask internal paths in forward_host from API responses
				// /data/websites/host-N paths expose server filesystem layout to users
				if (row.forward_host?.startsWith("/data/websites/")) {
					row.forward_host = "(managed)";
				}
				for (const field of ["terminal_password", "terminal_private_key", "terminal_gateway_secret"]) {
					delete row[field];
				}
				return row;
			});
		}

		if (pageResult) {
			return {
				items: rows,
				pagination: {
					limit: pagination.limit,
					page: pagination.page,
					totalItems: pageResult.total,
					totalPages: Math.ceil(pageResult.total / pagination.limit),
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
