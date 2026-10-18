import _ from "lodash";
import { captureConfigurationFiles, restoreConfigurationFiles } from "../lib/configuration-files.js";
import { encrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import { withHostDomainClaims } from "../lib/host-domain-claims.js";
import { sanitizeHostMeta, sanitizeProxyHost } from "../lib/host-response.js";
import { rethrowAfterHostRollback } from "../lib/host-rollback.js";
import { notifyProxyHostDomainsChanged } from "../lib/proxy-host-domain-events.js";
import utils from "../lib/utils.js";
import AccessList from "../models/access_list.js";
import proxyHostModel from "../models/proxy_host.js";
import internalAuditLog from "./audit-log.js";
import internalCertificate from "./certificate.js";
import { assertHostFirewallGeoipAvailable, validateHostFirewall, withFirewallReferences } from "./firewall-policy.js";
import internalGitDeploy from "./git-deploy.js";
import internalGitOps from "./gitops.js";
import internalHost from "./host.js";
import internalHostRevisions, { captureHostState, restoreHostState } from "./host-revisions.js";
import internalNginx from "./nginx.js";
import internalOAuth2Proxy from "./oauth2-proxy.js";
import internalProxyHostMonitor from "./proxy-host-monitor.js";
import { prepareProxyHostPolicies } from "./proxy-host-policies.js";
import { validateRelayConfigForHost } from "./upload-relay.js";

const omissions = () => {
	return ["is_deleted", "owner.is_deleted"];
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
		const otherHosts = await proxyHostModel
			.query()
			.where("access_list_id", accessListId)
			.where("is_deleted", 0)
			.where("enabled", 1);
		if (otherHosts.length === 0) {
			await internalOAuth2Proxy.stop(accessListId);
		} else {
			// Refresh redirect domains after a host was removed, disabled or renamed.
			await internalOAuth2Proxy.start(list);
		}
	} catch (err) {
		console.error(`[OAuth2Proxy] Error cleaning up proxy for access list #${accessListId}:`, err);
	}
};

/** Reconcile background services only after a host revision is accepted. */
export async function reconcileRestoredHost(previous, current) {
	const fields = ["forward_scheme", "forward_host", "forward_port", "terminal_host", "terminal_port"];
	if (
		!_.isEqual(
			fields.map((field) => previous[field] ?? null),
			fields.map((field) => current[field] ?? null),
		) ||
		!_.isEqual(previous.meta?.upstream_pool ?? null, current.meta?.upstream_pool ?? null)
	) {
		try {
			await internalProxyHostMonitor.resetHost(current.id, { disableUnsupported: true });
		} catch (error) {
			console.error(`[Monitor] Could not reset accepted host #${current.id}:`, error);
		}
	}
	if (!current.is_deleted && current.enabled && current.git_sync_enabled && current.git_repo_url)
		internalGitDeploy.startPollingForHost(current);
	else internalGitDeploy.stopPolling(current.id);
	if (!current.is_deleted && current.enabled) await _ensureOAuth2Proxy(current.access_list_id);
	else await _cleanupOAuth2Proxy(current.access_list_id);
	if (previous.access_list_id !== current.access_list_id) await _cleanupOAuth2Proxy(previous.access_list_id);
}

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
	 * @param   {Array<Object>} [data.host_domains]
	 * @param   {boolean|number} [data.upload_relay_enabled]
	 * @param   {number} [data.upload_relay_chunk_size]
	 * @param   {number} [data.upload_relay_max_file_size]
	 * @param   {number} [data.upload_relay_max_pending_bytes]
	 * @param   {number} [data.upload_relay_cleanup_hours]
	 * @param   {string} [data.upload_relay_path]
	 * @param   {string} [data.upload_relay_target_path]
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		let thisData = data;
		const requestedMeta = data.meta === undefined ? undefined : structuredClone(data.meta);
		const createCertificate = thisData.certificate_id === "new";

		if (createCertificate) {
			delete thisData.certificate_id;
		}

		await access.can("proxy_hosts:create", thisData);
		await internalHost.validateReferences(access, thisData);
		await validateHostFirewall(access, thisData);
		await prepareProxyHostPolicies(thisData, {}, requestedMeta);
		internalHost.validateDomainNames(thisData.domain_names);

		// At this point the domains should have been checked
		thisData.owner_user_id = access.token.getUserId(1);
		thisData = internalHost.cleanSslHstsData(createCertificate, thisData);

		// Fix for db field not having a default value
		// for this optional field.
		if (typeof thisData.advanced_config === "undefined") {
			thisData.advanced_config = "";
		}
		if (thisData.upload_relay_enabled) await validateRelayConfigForHost(thisData);

		// Encrypt terminal credentials if present
		if (thisData.git_credentials) {
			thisData.git_credentials = encrypt(thisData.git_credentials);
		}
		if (thisData.forward_scheme === "terminal") {
			if (thisData.terminal_password) {
				thisData.terminal_password = encrypt(thisData.terminal_password);
			}
			if (thisData.terminal_private_key) {
				thisData.terminal_private_key = encrypt(thisData.terminal_private_key);
			}
		}

		// Transform domain_names into host_domains relation objects for insertGraph
		if (thisData.domain_names && Array.isArray(thisData.domain_names)) {
			thisData.host_domains = thisData.domain_names.map((domain) => ({ domain_name: domain }));
		}

		if (createCertificate) {
			const cert = await internalCertificate.createQuickCertificate(access, thisData);
			thisData.certificate_id = cert.id;
		}
		return internalNginx.withConfigurationLock(async () => {
			// Objection graph writes span multiple statements and do not start a transaction.
			let row = await withFirewallReferences(
				thisData,
				{},
				() =>
					withHostDomainClaims({ hostType: "proxy", domainNames: thisData.domain_names }, async (trx) =>
						proxyHostModel
							.query(trx)
							.insertGraphAndFetch(
								/** @type {any} */ ({ ...thisData, meta: sanitizeHostMeta(thisData.meta) }),
							),
					),
				{ lockHeld: true },
			);
			row = utils.omitRow(omissions())(row);

			// re-fetch with cert
			row = await internalProxyHost.get(
				access,
				{
					id: row.id,
					expand: ["certificate", "owner", "access_list.[clients,items]", "host_domains"],
				},
				{ preserveManagedPath: true },
			);

			// Configure nginx
			row.meta = await (async () => {
				const files = await captureConfigurationFiles([internalNginx.getConfigName("proxy_host", row.id)]);
				try {
					const meta = await internalNginx.configureHost(proxyHostModel, "proxy_host", row);
					if (meta.nginx_err || (row.enabled && meta.nginx_online === false))
						throw new errs.ConfigurationError("Host activation failed");
					await internalHostRevisions.record(access, row.id, "created");
					return meta;
				} catch (error) {
					await withHostDomainClaims({ hostType: "proxy", hostId: row.id, domainNames: [] }, (trx) =>
						proxyHostModel.query(trx).where("id", row.id).patch({ is_deleted: 1 }),
					);
					await restoreConfigurationFiles(files);
					await internalNginx.reload();
					throw error;
				}
			})();

			// Audit log
			thisData.meta = _.assign({}, thisData.meta || {}, row.meta);

			// Add to audit log
			await internalAuditLog.add(access, {
				action: "created",
				object_type: "proxy-host",
				object_id: row.id,
				meta: sanitizeProxyHost(thisData),
			});

			// Trigger GitOps auto-push
			internalGitOps.triggerAutoPush("proxy-host");

			// Start Git Deploy polling if enabled
			if (row.enabled && row.git_sync_enabled && row.git_repo_url) {
				internalGitDeploy.startPollingForHost(row);
			}

			// Start OAuth2 Proxy if needed
			if (row.enabled) await _ensureOAuth2Proxy(row.access_list_id);

			await notifyProxyHostDomainsChanged();
			return sanitizeProxyHost(row);
		});
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
	 * @param  {Array<Object>} [data.host_domains]
	 * @return {Promise}
	 */
	update: async (access, data, options = {}) => {
		// Normal updates write requested host fields, never a previously fetched graph.
		// Domains are rebuilt below; shared resources and timestamps have their own writers.
		let thisData = _.omit(data, [
			"created_on",
			"modified_on",
			"is_deleted",
			"owner_user_id",
			"owner",
			"certificate",
			"access_list",
			"tor_onion",
			"host_domains",
			"maintenance_pending",
			"git_last_sync",
			"git_last_commit",
			"git_last_error",
		]);
		const requestedMeta = data.meta === undefined ? undefined : structuredClone(data.meta);
		const create_certificate = thisData.certificate_id === "new";

		if (create_certificate) {
			delete thisData.certificate_id;
		}

		await access.can("proxy_hosts:update", thisData.id);

		if (thisData.domain_names !== undefined) internalHost.validateDomainNames(thisData.domain_names);

		let row = await internalProxyHost.get(access, { id: thisData.id }, { preserveManagedPath: true });
		await internalHost.validateReferences(access, thisData, row);
		await validateHostFirewall(access, thisData, row);
		// The API masks managed paths; preserve the actual path when an edit sends that placeholder back.
		if (thisData.forward_host === "(managed)" && row.forward_host?.startsWith("/data/websites/")) {
			thisData.forward_host = row.forward_host;
		}

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
			thisData,
		);

		const relayCandidate = _.assign({}, row, thisData);
		if (relayCandidate.upload_relay_enabled) await validateRelayConfigForHost(relayCandidate);

		if (data.git_credentials) {
			thisData.git_credentials = encrypt(data.git_credentials);
		} else if (typeof data.git_credentials !== "undefined" && data.git_credentials === "") {
			// Empty string means preserve existing credentials (do not update)
			delete thisData.git_credentials;
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

		// Transform domain_names into host_domains relation objects for upsertGraph
		if (thisData.domain_names && Array.isArray(thisData.domain_names)) {
			thisData.host_domains = thisData.domain_names.map((domain) => ({ domain_name: domain }));
		}

		return internalNginx.withConfigurationLock(async () => {
			// Recheck visibility and capture trusted state after waiting for other activations.
			const updateAccess = await access.can("proxy_hosts:update", thisData.id);
			await internalProxyHost.get(access, { id: thisData.id }, { preserveManagedPath: true });
			const previous = await captureHostState(thisData.id);
			if (!options.skip_configure && previous.host.meta?.nginx_online !== false)
				await internalHostRevisions.record(access, row.id, "baseline");
			if (data.domain_names === undefined) {
				thisData.domain_names = previous.host.domain_names;
				thisData.host_domains = previous.host.domain_names.map((domain_name) => ({ domain_name }));
			}
			// Use fresh SSL context without copying the rollback snapshot's loaded relations,
			// timestamps, credentials or unrelated scalar fields into upsertGraphAndFetch.
			thisData = internalHost.cleanSslHstsData(
				create_certificate,
				thisData,
				_.pick(previous.host, ["certificate_id", "ssl_forced", "hsts_enabled", "hsts_subdomains"]),
			);
			let written = false;
			try {
				await withFirewallReferences(
					thisData,
					previous.host,
					() =>
						withHostDomainClaims(
							{
								hostType: "proxy",
								hostId: thisData.id,
								domainNames: thisData.domain_names,
								retainedDomainNames: options.skip_configure ? [] : previous.host.domain_names,
							},
							async (trx) => {
								const current = await proxyHostModel.query(trx).findById(thisData.id).forUpdate();
								if (
									!current ||
									current.is_deleted ||
									(updateAccess.permission_visibility !== "all" &&
										current.owner_user_id !== access.token.getUserId(1))
								)
									throw new errs.ItemNotFoundError(thisData.id);
								await prepareProxyHostPolicies(thisData, current, requestedMeta);
								return proxyHostModel.query(trx).upsertGraphAndFetch(/** @type {any} */ (thisData));
							},
						),
					{ lockHeld: true },
				);
				written = true;
				row = await internalProxyHost.get(
					access,
					{
						id: thisData.id,
						expand: ["owner", "certificate", "access_list.[clients,items]", "host_domains"],
					},
					{ preserveManagedPath: true },
				);
				if (!options.skip_configure) {
					row.meta = await internalNginx.configureHost(proxyHostModel, "proxy_host", row);
					if (row.meta.nginx_err || (row.enabled && row.meta.nginx_online === false))
						throw new errs.ConfigurationError("Host activation failed; previous configuration restored");
					await internalHostRevisions.record(access, row.id, "updated");
					await withHostDomainClaims(
						{ hostType: "proxy", hostId: row.id, domainNames: thisData.domain_names },
						async () => {},
					);
				}
			} catch (error) {
				if (written) {
					await rethrowAfterHostRollback(error, {
						hostId: thisData.id,
						operation: "update",
						restore: () => restoreHostState(previous),
						reload: () => internalNginx.reload(),
					});
				}
				throw error;
			}
			await notifyProxyHostDomainsChanged();
			await internalAuditLog.add(access, {
				action: "updated",
				object_type: "proxy-host",
				object_id: row.id,
				meta: sanitizeProxyHost(thisData),
			});
			internalGitOps.triggerAutoPush("proxy-host");
			if (!options.skip_configure) await reconcileRestoredHost(previous.host, row);
			return sanitizeProxyHost(_.omit(internalHost.cleanRowCertificateMeta(row), omissions()));
		});
	},

	/**
	 * @param  {import("../lib/types.js").Access}   access
	 * @param  {Object}   data
	 * @param  {Number}   data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise}
	 */
	get: async (access, data, options = {}) => {
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
		const cleanedRow = internalHost.cleanRowCertificateMeta(row);
		const thisRow = options.preserveManagedPath ? cleanedRow : sanitizeProxyHost(cleanedRow);
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

		await internalNginx.withConfigurationLock(async () => {
			await internalProxyHost.get(access, { id: data.id });
			const previous = await captureHostState(row.id);
			await internalNginx.backupConfig("proxy_host", row);
			let written = false;
			try {
				await withHostDomainClaims(
					{
						hostType: "proxy",
						hostId: row.id,
						domainNames: [],
						retainedDomainNames: previous.host.domain_names,
					},
					async (trx) => proxyHostModel.query(trx).where("id", row.id).patch({ is_deleted: 1 }),
				);
				written = true;
				await internalNginx.deleteConfig("proxy_host", row);
				await internalNginx.reload();
				await withHostDomainClaims({ hostType: "proxy", hostId: row.id, domainNames: [] }, async () => {});
			} catch (error) {
				if (written) {
					await rethrowAfterHostRollback(error, {
						hostId: row.id,
						operation: "delete",
						restore: () => restoreHostState(previous),
						reload: () => internalNginx.reload(),
					});
				}
				throw error;
			}
			try {
				await internalNginx.deleteBackupConfig("proxy_host", row);
			} catch (error) {
				console.error(`[Nginx] Could not clear backup for deleted host #${row.id}:`, error);
			}
		});
		await notifyProxyHostDomainsChanged();

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "proxy-host",
			object_id: row.id,
			meta: sanitizeProxyHost(row),
		});

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("proxy-host");

		// Stop Git Deploy polling
		internalGitDeploy.stopPolling(data.id);
		// The host has been deleted after a validated reload; failed monitoring cleanup
		// must not turn that successful host deletion into an API error.
		try {
			await internalProxyHostMonitor.removeHost(data.id);
		} catch (error) {
			console.error(`[Monitor] Could not clear history for deleted host #${data.id}:`, error);
		}

		try {
			const { default: traffic } = await import("./host-traffic-policy.js");
			await traffic.removeHostFiles(data.id);
		} catch (error) {
			console.error(`[Traffic] Could not clear files for deleted host #${data.id}:`, error);
		}

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
		const row = await internalProxyHost.get(
			access,
			{
				id: data.id,
				expand: ["certificate", "owner", "access_list.[clients,items]", "host_domains"],
			},
			{ preserveManagedPath: true },
		);

		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		if (row.enabled) {
			throw new errs.ValidationError("Host is already enabled");
		}
		if (row.upload_relay_enabled) await validateRelayConfigForHost(row);
		await assertHostFirewallGeoipAvailable(row.meta?.ip_firewall);

		await internalNginx.withConfigurationLock(async () => {
			await internalProxyHost.get(access, { id: row.id });
			const previous = await captureHostState(row.id);
			await internalHostRevisions.record(access, row.id, "baseline");
			try {
				await proxyHostModel.query().where("id", row.id).patch({ enabled: 1 });
				const meta = await internalNginx.configureHost(proxyHostModel, "proxy_host", { ...row, enabled: true });
				if (meta.nginx_err || meta.nginx_online === false)
					throw new errs.ConfigurationError("Host activation failed");
				await internalHostRevisions.record(access, row.id, "enabled");
			} catch (error) {
				await rethrowAfterHostRollback(error, {
					hostId: row.id,
					operation: "enable",
					restore: () => restoreHostState(previous),
					reload: () => internalNginx.reload(),
				});
			}
			await reconcileRestoredHost(previous.host, { ...row, enabled: true });
		});

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "enabled",
			object_type: "proxy-host",
			object_id: row.id,
			meta: sanitizeProxyHost(row),
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

		await internalNginx.withConfigurationLock(async () => {
			await internalProxyHost.get(access, { id: row.id });
			const previous = await captureHostState(row.id);
			await internalHostRevisions.record(access, row.id, "baseline");
			try {
				await proxyHostModel.query().where("id", row.id).patch({ enabled: 0 });
				await internalNginx.deleteConfig("proxy_host", row);
				await internalNginx.reload();
				await internalHostRevisions.record(access, row.id, "disabled");
			} catch (error) {
				await rethrowAfterHostRollback(error, {
					hostId: row.id,
					operation: "disable",
					restore: () => restoreHostState(previous),
					reload: () => internalNginx.reload(),
				});
			}
			await reconcileRestoredHost(previous.host, { ...row, enabled: false });
		});

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "disabled",
			object_type: "proxy-host",
			object_id: row.id,
			meta: sanitizeProxyHost(row),
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
		const queriedRows = pageResult ? pageResult.results : await query;
		const rows = queriedRows?.map(sanitizeProxyHost);

		// return rows with count
		if (rows) {
			rows.map((row) => {
				if (row.certificate) {
					row.certificate.meta = {};
				}
				row.access_list_id = Number.parseInt(String(row.access_list_id), 10);
				row.connected_tunnels = row.count || 0;
				delete row.count;
				// SECURITY: Mask internal paths in forward_host from API responses
				// /data/websites/host-N paths expose server filesystem layout to users
				if (row.forward_host?.startsWith("/data/websites/")) {
					row.forward_host = "(managed)";
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
