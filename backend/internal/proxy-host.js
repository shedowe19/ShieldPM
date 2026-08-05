import _ from "lodash";
import { RelationExpression } from "objection";
import { encrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import AccessList from "../models/access_list.js";
import FirewallPolicy from "../models/firewall_policy.js";
import proxyHostModel from "../models/proxy_host.js";
import internalAuditLog from "./audit-log.js";
import internalCertificate from "./certificate.js";
import { withPolicyLocks } from "./firewall-policy.js";
import internalGitDeploy from "./git-deploy.js";
import internalGitOps from "./gitops.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";
import internalOAuth2Proxy from "./oauth2-proxy.js";

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
		const otherHosts = await proxyHostModel.query().where("access_list_id", accessListId).where("is_deleted", 0);
		if (otherHosts.length === 0) {
			await internalOAuth2Proxy.stop(accessListId);
		}
	} catch (err) {
		console.error(`[OAuth2Proxy] Error cleaning up proxy for access list #${accessListId}:`, err);
	}
};

const normaliseFirewallPolicyId = (value) => {
	if (value === null || value === 0 || value === "0") return null;
	const policyId = Number(value);
	if (!Number.isInteger(policyId) || policyId < 1) {
		throw new errs.ValidationError("firewall_policy_id must be a valid policy ID or null.");
	}
	return policyId;
};

const validateFirewallPolicyAssignment = async (access, value, currentValue = null) => {
	const policyId = normaliseFirewallPolicyId(value);
	const currentPolicyId = normaliseFirewallPolicyId(currentValue);
	// Hidden fields in an ordinary user's proxy-host form still submit their current
	// value. Requiring Settings access for a no-op would make every such save fail.
	if (policyId === currentPolicyId) return policyId;

	await access.can("settings:update", "firewall-policies");
	if (policyId === null) return null;
	if (!(await FirewallPolicy.query().findById(policyId))) {
		throw new errs.ItemNotFoundError(policyId);
	}
	return policyId;
};

const withFirewallPolicyAssignmentLock = async (currentPolicyId, requestedPolicyId, operation) =>
	await withPolicyLocks([currentPolicyId, requestedPolicyId], operation);

const currentFirewallPolicyId = (row) =>
	row?.firewall_policy_id === null || typeof row?.firewall_policy_id === "undefined"
		? null
		: normaliseFirewallPolicyId(row.firewall_policy_id);

const withCurrentFirewallPolicyLock = async (hostId, operation) => {
	for (;;) {
		const snapshot = await proxyHostModel.query().findById(hostId);
		if (!snapshot || snapshot.is_deleted) throw new errs.ItemNotFoundError(hostId);
		const policyId = currentFirewallPolicyId(snapshot);
		const result = await withPolicyLocks([policyId], async () => {
			const current = await proxyHostModel.query().findById(hostId);
			if (!current || current.is_deleted) return { missing: true };
			if (currentFirewallPolicyId(current) !== policyId) return { retry: true };
			return { value: await operation(current) };
		});
		if (result.retry) continue;
		if (result.missing) throw new errs.ItemNotFoundError(hostId);
		return result.value;
	}
};

const withCurrentFirewallPolicyAssignmentLock = async (hostId, requestedPolicyId, operation) => {
	for (;;) {
		const snapshot = await proxyHostModel.query().findById(hostId);
		if (!snapshot || snapshot.is_deleted) throw new errs.ItemNotFoundError(hostId);
		const currentPolicyId = currentFirewallPolicyId(snapshot);
		const result = await withPolicyLocks([currentPolicyId, requestedPolicyId], async () => {
			const current = await proxyHostModel.query().findById(hostId);
			if (!current || current.is_deleted) return { missing: true };
			if (currentFirewallPolicyId(current) !== currentPolicyId) return { retry: true };
			return { value: await operation() };
		});
		if (result.retry) continue;
		if (result.missing) throw new errs.ItemNotFoundError(hostId);
		return result.value;
	}
};

const graphContainsRelation = (expression, relationName) => {
	if (expression.$relation === relationName) return true;
	return expression.$childNames.some((childName) => graphContainsRelation(expression[childName], relationName));
};

const requestsFirewallPolicy = (expand) =>
	Array.isArray(expand) &&
	expand.some((relation) => graphContainsRelation(RelationExpression.create(relation).toPojo(), "firewall_policy"));

const proxyHostAllowedGraph = (expand) =>
	requestsFirewallPolicy(expand)
		? "[owner,access_list.[clients,items],certificate,host_domains,firewall_policy]"
		: "[owner,access_list.[clients,items],certificate,host_domains]";

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
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		let thisData = data;
		const createCertificate = thisData.certificate_id === "new";

		if (createCertificate) {
			delete thisData.certificate_id;
		}

		await access.can("proxy_hosts:create", thisData);
		const requestedFirewallPolicyId =
			typeof thisData.firewall_policy_id === "undefined"
				? null
				: normaliseFirewallPolicyId(thisData.firewall_policy_id);
		const createProxyHost = async () => {
			if (typeof thisData.firewall_policy_id !== "undefined") {
				thisData.firewall_policy_id = await validateFirewallPolicyAssignment(
					access,
					thisData.firewall_policy_id,
					null,
				);
			}

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

			// Transform domain_names into host_domains relation objects for insertGraph
			if (thisData.domain_names && Array.isArray(thisData.domain_names)) {
				thisData.host_domains = thisData.domain_names.map((domain) => ({ domain_name: domain }));
			}

			let row = await proxyHostModel.query().insertGraphAndFetch(/** @type {any} */ (thisData));
			row = utils.omitRow(omissions())(row);

			if (createCertificate) {
				const cert = await internalCertificate.createQuickCertificate(access, thisData);
				// update host with cert id
				await internalProxyHost.update(
					access,
					{
						id: row.id,
						certificate_id: cert.id,
					},
					{ skip_configure: true, skip_firewall_policy_lock: true },
				);
			}

			// re-fetch with cert
			row = await internalProxyHost.get(access, {
				id: row.id,
				expand: ["certificate", "owner", "access_list.[clients,items]", "host_domains"],
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

			// Start OAuth2 Proxy if needed
			await _ensureOAuth2Proxy(row.access_list_id);

			return row;
		};
		return await withFirewallPolicyAssignmentLock(null, requestedFirewallPolicyId, createProxyHost);
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

		const requestedFirewallPolicyId =
			typeof thisData.firewall_policy_id === "undefined"
				? null
				: normaliseFirewallPolicyId(thisData.firewall_policy_id);
		const updateProxyHost = async () => {
			let row = await internalProxyHost.get(access, { id: thisData.id });
			if (typeof thisData.firewall_policy_id !== "undefined") {
				thisData.firewall_policy_id = await validateFirewallPolicyAssignment(
					access,
					thisData.firewall_policy_id,
					row.firewall_policy_id,
				);
			}
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

			// Transform domain_names into host_domains relation objects for upsertGraph
			if (thisData.domain_names && Array.isArray(thisData.domain_names)) {
				thisData.host_domains = thisData.domain_names.map((domain) => ({ domain_name: domain }));
			}

			const new_saved_row = /** @type {any} */ (
				await proxyHostModel.query().upsertGraphAndFetch(/** @type {any} */ (thisData))
			);
			const _saved_row = utils.omitRow(omissions())(new_saved_row);

			// Add to audit log
			await internalAuditLog.add(access, {
				action: "updated",
				object_type: "proxy-host",
				object_id: row.id,
				meta: thisData,
			});

			row = await internalProxyHost.get(access, {
				id: thisData.id,
				expand: ["owner", "certificate", "access_list.[clients,items]", "host_domains"],
			});

			if (!options.skip_configure) {
				// Configure nginx
				const new_meta = await internalNginx.configure(proxyHostModel, "proxy_host", row);
				row.meta = new_meta;
			}

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
		};
		return options.skip_firewall_policy_lock
			? await updateProxyHost()
			: await withCurrentFirewallPolicyAssignmentLock(thisData.id, requestedFirewallPolicyId, updateProxyHost);
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
		if (requestsFirewallPolicy(thisData.expand)) {
			await access.can("settings:update", "firewall-policies");
		}

		const query = proxyHostModel
			.query()
			.where("is_deleted", 0)
			.andWhere("id", thisData.id)
			.allowGraph(proxyHostAllowedGraph(thisData.expand))
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

		await withCurrentFirewallPolicyLock(row.id, async () => {
			const deleted = await proxyHostModel
				.query()
				.where("id", row.id)
				.where("is_deleted", 0)
				.patch({ is_deleted: 1 });
			if (!deleted) throw new errs.ItemNotFoundError(row.id);

			// Deletion shares the proxy-host render lock, so a stale renderer cannot
			// recreate this vhost after the logical delete has committed.
			await internalNginx.deleteConfig("proxy_host", /** @type {any} */ (row));
			await internalNginx.reload();
		});

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
		let row = await internalProxyHost.get(access, {
			id: data.id,
			expand: ["certificate", "owner", "access_list", "host_domains"],
		});

		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}
		if (row.enabled) {
			throw new errs.ValidationError("Host is already enabled");
		}

		await withCurrentFirewallPolicyLock(row.id, async (current) => {
			if (current.enabled) throw new errs.ValidationError("Host is already enabled");
			await proxyHostModel.query().where("id", row.id).patch({
				enabled: 1,
			});

			// Keep enable serialized with policy lifecycle operations. A policy delete
			// must not detach a disabled host while a concurrent enable renders it with
			// maps that are about to be removed.
			row = { ...row, ...current, enabled: 1 };
			await internalNginx.configure(proxyHostModel, "proxy_host", row);
		});

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

		await withCurrentFirewallPolicyLock(row.id, async (current) => {
			if (!current.enabled) throw new errs.ValidationError("Host is already disabled");
			await proxyHostModel.query().where("id", row.id).patch({ enabled: 0 });

			// Config removal is serialized with every proxy-host renderer.
			await internalNginx.deleteConfig("proxy_host", row);
			await internalNginx.reload();
		});

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
		if (requestsFirewallPolicy(expand)) {
			await access.can("settings:update", "firewall-policies");
		}
		const query = proxyHostModel
			.query()
			.where("is_deleted", 0)
			.groupBy("id")
			.allowGraph(proxyHostAllowedGraph(expand))
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

export {
	normaliseFirewallPolicyId,
	proxyHostAllowedGraph,
	requestsFirewallPolicy,
	validateFirewallPolicyAssignment,
	withCurrentFirewallPolicyAssignmentLock,
	withCurrentFirewallPolicyLock,
	withFirewallPolicyAssignmentLock,
};
export default internalProxyHost;
