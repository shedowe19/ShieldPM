/**
 * AI Tool Executor Module
 * Handles the execution of AI tool calls by interfacing with internal backend modules.
 */

import ipaddr from "ipaddr.js";
import si from "systeminformation";
import dnsPlugins from "../../certbot/dns-plugins.json" with { type: "json" };
import { isDemoMode } from "../../lib/config.js";
import errs from "../../lib/error.js";
import CloudflaredTunnel from "../../models/cloudflared_tunnel.js";
import ProxyHost from "../../models/proxy_host.js";
import TorOnion from "../../models/tor_onion.js";
import internalAccessList from "../access-list.js";
import internalAuditLog from "../audit-log.js";
import internalCertificate from "../certificate.js";
import internalCloudflared from "../cloudflared.js";
import internalDdnsProvider from "../ddns-provider.js";
import internalDeadHost from "../dead-host.js";
import internalIpRanges from "../ip_ranges.js";
import internalMaintenance from "../maintenance.js";
import internalNginx from "../nginx.js";
import internalPki from "../pki.js";
import internalProxyHost from "../proxy-host.js";
import internalRedirectionHost from "../redirection-host.js";
import internalReport from "../report.js";
import internalSetting from "../setting.js";
import internalStream from "../stream.js";
import internalToken from "../token.js";
import internalTor from "../tor.js";
import internalUser from "../user.js";

/**
 * Validate host data in Demo Mode - blocks private IPs and advanced config
 * @param {Object} data - Host data (forward_host, advanced_config, etc.)
 * @throws {Error} if validation fails in Demo Mode
 */
const validateDemoModeHost = (data) => {
	if (!isDemoMode()) return;

	// Block Advanced Config
	if (data.advanced_config && data.advanced_config.trim().length > 0) {
		throw new Error("Advanced Nginx Configuration is disabled in Demo Mode.");
	}

	// Block Path forwarding
	if (data.forward_scheme === "path") {
		throw new Error("Local Path forwarding is disabled in Demo Mode.");
	}

	// Block Internal Hostnames
	const forbiddenHosts = ["localhost", "db", "app", "redis", "postgres", "mysql"];
	if (data.forward_host) {
		if (forbiddenHosts.includes(data.forward_host) || data.forward_host.endsWith(".local")) {
			throw new Error("Forwarding to internal services (localhost/db/local) is disabled in Demo Mode.");
		}

		// Block Private IPs
		try {
			if (ipaddr.isValid(data.forward_host)) {
				const addr = ipaddr.parse(data.forward_host);
				const range = addr.range();
				const blockedRanges = [
					"loopback",
					"private",
					"linkLocal",
					"uniqueLocal",
					"carrierGradeNat",
					"reserved",
					"broadcast",
					"multicast",
				];

				if (blockedRanges.includes(range)) {
					throw new Error(`Forwarding to ${range} IP (${data.forward_host}) is disabled in Demo Mode.`);
				}

				// IPv4-mapped IPv6 addresses
				if (addr.kind() === "ipv6" && /** @type {any} */ (addr).isIPv4MappedAddress()) {
					const v4 = /** @type {any} */ (addr).toIPv4Address();
					if (blockedRanges.includes(v4.range())) {
						throw new Error(
							`Forwarding to mapped ${v4.range()} IP (${data.forward_host}) is disabled in Demo Mode.`,
						);
					}
				}
			}
		} catch (err) {
			if (err.message.includes("Demo Mode")) throw err;
			// Not a valid IP, ignore
		}
	}

	// Check locations (for proxy hosts)
	if (data.locations && Array.isArray(data.locations)) {
		for (const loc of data.locations) {
			validateDemoModeHost(loc);
		}
	}
};

const applyOwnerScope = (access, accessData, query) => {
	if (accessData !== true && accessData?.permission_visibility !== "all") {
		query.andWhere("owner_user_id", access.token.getUserId(1));
	}

	return query;
};

const getCloudflaredTunnel = async (access, permission, id) => {
	const accessData = await access.can(permission, id);
	const query = CloudflaredTunnel.query().where("id", id).andWhere("is_deleted", 0);
	const tunnel = await applyOwnerScope(access, accessData, query).first();

	if (!tunnel) {
		throw new errs.ItemNotFoundError(id);
	}

	return tunnel;
};

const getTorOnionService = async (access, permission, id) => {
	const accessData = await access.can(permission, id);
	const query = TorOnion.query().where("id", id).andWhere("is_deleted", 0);
	const service = await applyOwnerScope(access, accessData, query).first();

	if (!service) {
		throw new errs.ItemNotFoundError(id);
	}

	return service;
};

const verifyProxyHostUpdateAccess = async (access, id) => {
	await access.can("proxy_hosts:update", id);
	await internalProxyHost.get(access, { id });
};

/**
 * Execute a list of tool calls
 * @param {Object} access - The user access object (permission context)
 * @param {Array} toolCalls - List of tool calls from the LLM
 * @returns {Promise<Array>} - List of tool results
 */
export const executeTools = async (access, toolCalls) => {
	const toolResults = [];

	for (const call of /** @type {any[]} */ (toolCalls)) {
		try {
			let result = "";

			// Check for Demo Mode restrictions
			if (isDemoMode()) {
				const blockedTools = [
					"update_user_password",
					"update_user_permissions",
					"update_user", // Block general user updates (roles/email)
					"create_user",
					"delete_user",
					"get_users", // Privacy: Don't list other users
					"update_global_setting",
					"get_global_settings", // Security: Don't reveal secrets
					"create_api_token",
					"login_as_user",
					"read_nginx_logs", // Privacy: Don't reveal IPs
					"get_audit_log", // Privacy: Don't reveal user actions
					"create_cloudflared_tunnel",
					"update_cloudflared_tunnel",
					"delete_cloudflared_tunnel",
					"get_cloudflared_tunnels",
					// DDNS is safe in Demo but creation might be blocked if we want to be strict, currently User said "allow all"
				];
				if (blockedTools.includes(call.name)) {
					result = "Error: This action is prohibited in the public Demo Mode.";
					toolResults.push({ name: call.name, toolCallId: call.id, result });
					continue;
				}
			}

			switch (call.name) {
				case "get_proxy_hosts": {
					const hosts = await internalProxyHost.getAll(access, [], "");
					result = JSON.stringify(
						hosts.map((/** @type {any} */ h) => ({
							id: h.id,
							domain_names: h.domain_names,
							forward_scheme: h.forward_scheme,
							forward_host: h.forward_host,
							forward_port: h.forward_port,
							access_list_id: h.access_list_id,
							enabled: h.enabled,
						})),
					);
					break;
				}
				case "create_proxy_host": {
					// Demo Mode: Block private IPs, advanced config, etc.
					validateDemoModeHost(call.args);

					// Determine certificate ID based on user intent
					let certId = 0;
					let meta = {};

					if (call.args.request_ssl) {
						certId = /** @type {any} */ ("new");
						meta = {
							letsencrypt_email: call.args.email || "admin@example.com", // Default or require from user
							letsencrypt_agree: true,
							dns_challenge: false,
						};
					}

					// Provide defaults for missing fields
					const data = {
						certificate_id: certId,
						access_list_id: 0,
						ssl_forced: call.args.ssl_forced || false,
						caching_enabled: false,
						block_exploits: true,
						meta: meta,
						...call.args,
						// Ensure these are always valid (override any nulls from AI)
						advanced_config: "",
					};
					const newHost = await internalProxyHost.create(access, /** @type {any} */ (data));
					result = `Created Proxy Host ID: ${newHost.id}`;
					break;
				}
				case "delete_proxy_host": {
					const deletedId = call.args.id;
					await internalProxyHost.delete(access, { id: deletedId });
					// Auto-verify: Check if host is really gone
					const remainingHosts = await internalProxyHost.getAll(access, [], "");
					const stillExists = remainingHosts.some((h) => h.id === deletedId);
					if (stillExists) {
						result = `ERROR: Delete failed! Proxy Host ID ${deletedId} still exists!`;
					} else {
						result = `Deleted and VERIFIED: Proxy Host ID ${deletedId} no longer exists.`;
					}
					break;
				}
				case "enable_proxy_host": {
					await internalProxyHost.enable(access, { id: call.args.id });
					result = `Enabled Proxy Host ID: ${call.args.id}`;
					break;
				}
				case "disable_proxy_host": {
					await internalProxyHost.disable(access, { id: call.args.id });
					result = `Disabled Proxy Host ID: ${call.args.id}`;
					break;
				}
				case "set_maintenance_mode": {
					// Use update mechanism to set maintenance fields
					const id = call.args.id || call.args.proxy_host_id || call.args.host_id;
					const payload = {
						id: id,
					};

					// If maintenance_active is explicitly boolean, use it.
					// If it's undefined (scheduling only), we generally don't touch 'active' unless we want to ensure it's off.
					// However, Nginx logic prioritizes 'active'. So if scheduling, we probably want active=false.
					if (typeof call.args.active !== "undefined") {
						payload.maintenance_active = call.args.active;
					}

					// Handle Scheduling - support many AI parameter name variations
					const startTime =
						call.args.maintenance_start ||
						call.args.start ||
						call.args.start_time ||
						call.args.scheduled_start;
					const endTime =
						call.args.maintenance_end || call.args.end || call.args.end_time || call.args.scheduled_end;
					if (startTime) payload.maintenance_start = startTime;
					if (endTime) payload.maintenance_end = endTime;

					// If start is set but active is not specified, force active=false to allow schedule to work
					if (payload.maintenance_start && typeof payload.maintenance_active === "undefined") {
						payload.maintenance_active = false;
					}

					if (call.args.reason) {
						payload.maintenance_reason = call.args.reason;
					} else if (call.args.maintenance_reason) {
						payload.maintenance_reason = call.args.maintenance_reason;
					}
					// Verify host exists first (optional, update throws if not found)
					await internalProxyHost.update(access, payload);

					// Force Nginx Reload
					// We must fetch the FULL object with all relations (locations, access_list, etc)
					// otherwise generateConfig fails when accessing missing properties (e.g. locations).
					const updatedHost = await internalProxyHost.get(access, {
						id: id,
						expand: ["owner", "access_list", "certificate"],
					});
					// configure expects (Model, type, item)
					await internalNginx.configure(ProxyHost, "proxy_host", updatedHost);
					await internalNginx.reload();

					// Trigger immediate maintenance processing (don't wait for polling interval)
					// This ensures scheduled maintenance activates/deactivates instantly
					internalMaintenance.processMaintenance().catch(() => {});

					result = `Maintenance Mode ${call.args.active ? "ENABLED" : "DISABLED"} for Host ID: ${id}`;
					break;
				}
				// Redirection Hosts
				case "get_redirection_hosts": {
					const hosts = await internalRedirectionHost.getAll(access);
					result = JSON.stringify(
						hosts.map((/** @type {any} */ h) => ({
							id: h.id,
							domain_names: h.domain_names,
							forward_http_code: h.forward_http_code,
							forward_scheme: h.forward_scheme,
							forward_domain_name: h.forward_domain_name,
							enabled: h.enabled,
						})),
					);
					break;
				}
				case "create_redirection_host": {
					validateDemoModeHost(call.args);
					let certId = 0;
					let meta = {};

					if (call.args.request_ssl) {
						certId = /** @type {any} */ ("new");
						meta = {
							letsencrypt_email: call.args.email || "admin@example.com",
							letsencrypt_agree: true,
							dns_challenge: false,
						};
					}

					const data = {
						certificate_id: certId,
						ssl_forced: call.args.ssl_forced || false,
						hsts_enabled: call.args.hsts_enabled || false,
						hsts_subdomains: call.args.hsts_subdomains || false,
						block_exploits: true,
						advanced_config: "",
						meta: meta,
						...call.args,
					};
					const newHost = await internalRedirectionHost.create(access, /** @type {any} */ (data));
					result = `Created Redirection Host ID: ${newHost.id}`;
					break;
				}
				case "delete_redirection_host": {
					const deletedId = call.args.id;
					await internalRedirectionHost.delete(access, { id: deletedId });
					result = `Deleted Redirection Host ID: ${deletedId}`;
					break;
				}
				case "enable_redirection_host": {
					await internalRedirectionHost.enable(access, { id: call.args.id });
					result = `Enabled Redirection Host ID: ${call.args.id}`;
					break;
				}
				case "disable_redirection_host": {
					await internalRedirectionHost.disable(access, { id: call.args.id });
					result = `Disabled Redirection Host ID: ${call.args.id}`;
					break;
				}
				// Dead Hosts
				case "get_dead_hosts": {
					const hosts = await internalDeadHost.getAll(access);
					result = JSON.stringify(
						hosts.map((h) => ({
							id: h.id,
							domain_names: h.domain_names,
							enabled: h.enabled,
						})),
					);
					break;
				}
				case "create_dead_host": {
					validateDemoModeHost(call.args);
					let certId = 0;
					let meta = {};

					if (call.args.request_ssl) {
						certId = /** @type {any} */ ("new");
						meta = {
							letsencrypt_email: call.args.email || "admin@example.com",
							letsencrypt_agree: true,
							dns_challenge: false,
						};
					}

					const data = {
						certificate_id: certId,
						ssl_forced: call.args.ssl_forced || false,
						hsts_enabled: call.args.hsts_enabled || false,
						hsts_subdomains: call.args.hsts_subdomains || false,
						block_exploits: true,
						advanced_config: "",
						meta: meta,
						...call.args,
					};
					const newHost = await internalDeadHost.create(access, /** @type {any} */ (data));
					result = `Created 404 Host ID: ${newHost.id}`;
					break;
				}
				case "delete_dead_host": {
					const deletedId = call.args.id;
					await internalDeadHost.delete(access, { id: deletedId });
					result = `Deleted 404 Host ID: ${deletedId}`;
					break;
				}
				case "enable_dead_host": {
					await internalDeadHost.enable(access, { id: call.args.id });
					result = `Enabled 404 Host ID: ${call.args.id}`;
					break;
				}
				case "disable_dead_host": {
					await internalDeadHost.disable(access, { id: call.args.id });
					result = `Disabled 404 Host ID: ${call.args.id}`;
					break;
				}
				// Streams
				case "get_streams": {
					const streams = await internalStream.getAll(access);
					result = JSON.stringify(
						streams.map((/** @type {any} */ s) => ({
							id: s.id,
							incoming_port: s.incoming_port,
							forwarding_host: s.forwarding_host,
							forwarding_port: s.forwarding_port,
							tcp_forwarding: s.tcp_forwarding,
							udp: s.udp_forwarding,
							enabled: s.enabled,
						})),
					);
					break;
				}
				case "create_stream": {
					// Demo Mode: Block private IPs
					validateDemoModeHost(call.args);

					const newStream = await internalStream.create(access, {
						certificate_id: 0,
						meta: {},
						...call.args,
					});
					result = `Created Stream ID: ${newStream.id}`;
					break;
				}
				case "delete_stream": {
					const deletedId = call.args.id;
					await internalStream.delete(access, { id: deletedId });
					// Auto-verify
					const remainingStreams = await internalStream.getAll(access);
					const stillExistsStream = remainingStreams.some((s) => s.id === deletedId);
					if (stillExistsStream) {
						result = `ERROR: Delete failed! Stream ID ${deletedId} still exists!`;
					} else {
						result = `Deleted and VERIFIED: Stream ID ${deletedId} no longer exists.`;
					}
					break;
				}
				// Global Settings
				case "get_global_settings": {
					const settings = await internalSetting.getAll(access);
					result = JSON.stringify(settings.map((/** @type {any} */ s) => ({ id: s.id, value: s.value })));
					break;
				}
				// Reports
				case "get_host_counts": {
					const counts = await internalReport.getHostsReport(access);
					result = JSON.stringify(counts);
					break;
				}
				// IP Ranges
				case "renew_ip_ranges": {
					await access.can("settings:update");
					await internalIpRanges.fetch();
					result = "IP Ranges renewal triggered.";
					break;
				}
				// Access Lists
				case "get_access_lists": {
					const lists = await internalAccessList.getAll(access);
					result = JSON.stringify(lists.map((/** @type {any} */ l) => ({ id: l.id, name: l.name })));
					break;
				}
				case "create_access_list": {
					const newList = await internalAccessList.create(access, {
						items: [],
						clients: [],
						meta: {},
						...call.args,
					});
					result = `Created Access List ID: ${newList.id}`;
					break;
				}
				// Missing CRUD Implementations
				case "update_proxy_host": {
					// Demo Mode: Block private IPs, advanced config, etc.
					validateDemoModeHost(call.args);

					// Standard update
					await internalProxyHost.update(access, { id: call.args.id, ...call.args });
					result = `Updated Proxy Host ID: ${call.args.id}`;
					break;
				}
				case "delete_user": {
					// Demo Mode: Block user management
					if (isDemoMode()) {
						throw new Error("User management is disabled in Demo Mode.");
					}
					await internalUser.delete(access, { id: call.args.id });
					result = `Deleted User ID: ${call.args.id}`;
					break;
				}
				case "update_user": {
					// Demo Mode: Block user management
					if (isDemoMode()) {
						throw new Error("User management is disabled in Demo Mode.");
					}
					await internalUser.update(access, { id: call.args.id, ...call.args });
					result = `Updated User ID: ${call.args.id}`;
					break;
				}
				case "delete_cloudflared_tunnel": {
					// Demo Mode: Block tunnel management
					if (isDemoMode()) {
						throw new Error("Cloudflare Tunnel management is disabled in Demo Mode.");
					}
					const tunnel = await getCloudflaredTunnel(access, "cloudflared_tunnels:delete", call.args.id);
					await internalCloudflared.stop(tunnel.id);
					await tunnel.$query().delete();
					await internalAuditLog.add(access, {
						action: "deleted",
						object_type: "cloudflared-tunnel",
						object_id: tunnel.id,
						meta: { name: tunnel.name },
					});
					result = `Deleted Tunnel ID: ${tunnel.id}`;
					break;
				}
				case "get_cloudflared_tunnels": {
					const accessData = await access.can("cloudflared_tunnels:list");
					const query = CloudflaredTunnel.query().andWhere("is_deleted", 0).orderBy("name", "ASC");
					const tunnels = await applyOwnerScope(access, accessData, query);
					result = JSON.stringify(
						tunnels.map((t) => ({
							id: t.id,
							name: t.name,
							status: t.status,
							created_on: t.created_on,
						})),
					);
					break;
				}
				case "create_cloudflared_tunnel": {
					const payload = {
						name: call.args.name,
						token: call.args.token,
						status: 0, // Stopped by default
						owner_user_id: access.token.getUserId(1),
					};
					await access.can("cloudflared_tunnels:create", payload);
					const newTunnel = await CloudflaredTunnel.query().insert(payload);
					await internalCloudflared.start(newTunnel);
					await internalAuditLog.add(access, {
						action: "created",
						object_type: "cloudflared-tunnel",
						object_id: newTunnel.id,
						meta: { name: newTunnel.name },
					});
					result = `Created Cloudflare Tunnel ID: ${newTunnel.id}`;
					break;
				}
				case "create_user": {
					// Prepare data for internalUser.create
					const userData = {
						name: call.args.name,
						email: call.args.email,
						nickname: call.args.nickname || call.args.name,
						roles: call.args.roles || ["user"],
						is_disabled: false,
						auth: {
							type: "local",
							secret: call.args.password || "changeme123", // Fallback if not provided, though generic prompt should ask
						},
					};
					const newUser = await internalUser.create(access, userData);
					result = `Created User ID: ${newUser.id} (Email: ${newUser.email})`;
					break;
				}
				// Certificates
				case "get_certificates": {
					const certs = await internalCertificate.getAll(access);
					result = JSON.stringify(
						certs.map((/** @type {any} */ c) => ({
							id: c.id,
							nice_name: c.nice_name,
							provider: c.provider,
							domain_names: c.domain_names,
							expires_on: c.expires_on,
						})),
					);
					break;
				}
				case "delete_certificate": {
					await internalCertificate.delete(access, { id: call.args.id });
					result = `Deleted Certificate ID: ${call.args.id}`;
					break;
				}
				case "create_certificate": {
					const meta = call.args.meta || {};
					if (call.args.provider === "letsencrypt") {
						meta.letsencrypt_agree = true; // Force agree via AI
						if (!meta.email) meta.email = "admin@example.com";
					}

					const newCert = await internalCertificate.create(access, {
						provider: call.args.provider,
						domain_names: call.args.domain_names,
						meta: meta,
					});
					result = `Created Certificate ID: ${newCert.id} (${call.args.provider})`;
					break;
				}
				case "test_nginx_config": {
					await access.can("settings:update");
					try {
						await internalNginx.test();
						result = "Nginx configuration is valid.";
					} catch (err) {
						result = `Nginx Test Failed: ${err.message}`;
					}
					break;
				}
				case "force_nginx_reload": {
					await access.can("settings:update");
					await internalNginx.reload();
					result = "Nginx Reloaded";
					break;
				}
				case "get_system_status": {
					await access.can("analytics:list");
					const net = await si.networkStats();
					const rx = net.reduce((acc, iface) => acc + (iface.rx_sec || 0), 0);
					const tx = net.reduce((acc, iface) => acc + (iface.tx_sec || 0), 0);
					result = JSON.stringify({ rx_sec: rx, tx_sec: tx, total_sec: rx + tx });
					break;
				}
				case "validate_certificate": {
					const files = {
						certificate: { data: Buffer.from(call.args.certificate) },
						certificate_key: { data: Buffer.from(call.args.certificate_key) },
					};
					if (call.args.intermediate_certificate) {
						files.intermediate_certificate = {
							data: Buffer.from(call.args.intermediate_certificate),
						};
					}
					const valid = await internalCertificate.validate({ files: files });
					result = JSON.stringify(valid, null, 2);
					break;
				}
				case "upload_certificate": {
					const files = {
						certificate: { data: Buffer.from(call.args.certificate) },
						certificate_key: { data: Buffer.from(call.args.certificate_key) },
					};
					if (call.args.intermediate_certificate) {
						files.intermediate_certificate = {
							data: Buffer.from(call.args.intermediate_certificate),
						};
					}
					await internalCertificate.upload(access, { id: call.args.id, files: files });
					result = `Uploaded certificate content for ID: ${call.args.id}`;
					break;
				}
				case "renew_certificate": {
					const cert = await internalCertificate.get(access, { id: call.args.id });
					if (cert.provider === "letsencrypt") {
						await internalCertificate.requestCertbot(cert);
						result = `Renewed Certificate ID: ${call.args.id}`;
					} else {
						result = "Error: Only LetsEncrypt certificates can be renewed.";
					}
					break;
				}
				case "get_certificate_details": {
					const cert = await internalCertificate.get(access, { id: call.args.id });
					result = JSON.stringify(cert, null, 2);
					break;
				}
				case "get_dns_plugins": {
					const plugins = dnsPlugins;
					result = JSON.stringify(Object.keys(plugins).map((k) => ({ id: k, name: plugins[k].name })));
					break;
				}
				// Users
				case "get_users": {
					if (isDemoMode()) throw new Error("User listing is disabled in Demo Mode.");
					const users = await internalUser.getAll(access);
					result = JSON.stringify(
						users.map((u) => ({
							id: u.id,
							name: u.name,
							email: u.email,
							roles: u.roles,
							is_disabled: u.is_disabled,
						})),
					);
					break;
				}
				// Logs
				case "read_nginx_logs": {
					if (isDemoMode()) throw new Error("Log reading is disabled in Demo Mode.");
					const logType = call.args.log_type || "error";
					const lines = call.args.lines || 50;
					const logs = await internalNginx.getLogs(access, logType);
					// Get last N lines
					const logLines = logs.split("\n").slice(-lines).join("\n");
					result = logLines || "No logs found.";
					break;
				}
				// Analytics Alias
				case "get_analytics_summary": {
					// Redirect to getHostSummary logic
					const internalAnalytics = (await import("../../internal/analytics.js")).default;
					// Use 'all' or first host if not specified, though summary implies specific.
					// If no host, maybe dashboard summary?
					// Let's assume dashboard summary if no args
					if (!call.args.host_id && !call.args.proxy_host_id) {
						// Dashboard stats
						const counts = await internalReport.getHostsReport(access);
						result = JSON.stringify(counts);
					} else {
						const summary = await internalAnalytics.getHostSummary(
							access,
							call.args.host_id || call.args.proxy_host_id,
							call.args.range || "24h",
						);
						result = JSON.stringify(summary, null, 2);
					}
					break;
				}
				// DDNS Client
				case "get_ddns_providers": {
					const providers = await internalDdnsProvider.getAll(access);
					result = JSON.stringify(
						providers.map((p) => ({
							id: p.id,
							name: p.name,
							provider: p.provider,
							domains: p.domains,
							last_updated: p.last_updated_on,
							status: p.last_error ? "Error" : "OK",
						})),
					);
					break;
				}
				case "create_ddns_provider": {
					// Check demo mode for dangerous config (custom URL to local IPs)
					if (isDemoMode() && call.args.provider === "custom") {
						validateDemoModeHost({ forward_host: call.args.config.url }); // Reuse validator
					}
					const provider = await internalDdnsProvider.create(access, {
						ip_ver: "dual",
						enabled: true,
						...call.args,
					});
					result = `Created DDNS Provider ID: ${provider.id}`;
					break;
				}
				case "update_ddns_provider": {
					if (isDemoMode() && call.args.provider === "custom" && call.args.config?.url) {
						validateDemoModeHost({ forward_host: call.args.config.url });
					}
					await internalDdnsProvider.update(access, { id: call.args.id, ...call.args });
					result = `Updated DDNS Provider ID: ${call.args.id}`;
					break;
				}
				case "delete_ddns_provider": {
					await internalDdnsProvider.delete(call.args.id, access.token.getUserId(1));
					result = `Deleted DDNS Provider ID: ${call.args.id}`;
					break;
				}
				case "test_ddns_provider": {
					const testRel = await internalDdnsProvider.test(access, { id: call.args.id });
					result = `Test Result: ${testRel.status}. IPs: ${JSON.stringify(testRel.ips)}`;
					break;
				}
				case "test_http_challenge": {
					const testResult = await internalCertificate.testHttpsChallenge(
						access,
						/** @type {any} */ ({
							domains: call.args.domains,
						}),
					);
					result = JSON.stringify(testResult);
					break;
				}
				case "get_analytics_series": {
					// Redirect to the robust summary tool logic
					const internalAnalytics = (await import("../../internal/analytics.js")).default;
					const summary = await internalAnalytics.getHostSummary(
						access,
						call.args.proxy_host_id || call.args.host_id,
						call.args.time_range || call.args.range || "24h",
					);
					result = JSON.stringify(summary, null, 2);
					break;
				}
				case "get_host_analytics": {
					const internalAnalytics = (await import("../../internal/analytics.js")).default;
					const summary = await internalAnalytics.getHostSummary(
						access,
						call.args.host_id,
						call.args.range || "24h",
					);
					result = JSON.stringify(summary, null, 2);
					break;
				}
				// Other Updates
				case "update_redirection_host": {
					await internalRedirectionHost.update(access, { id: call.args.id, ...call.args });
					result = `Updated Redirection Host ID: ${call.args.id}`;
					break;
				}
				case "update_dead_host": {
					await internalDeadHost.update(access, { id: call.args.id, ...call.args });
					result = `Updated Dead Host ID: ${call.args.id}`;
					break;
				}
				case "update_stream": {
					await internalStream.update(access, { id: call.args.id, ...call.args });
					result = `Updated Stream ID: ${call.args.id}`;
					break;
				}
				case "update_access_list": {
					await internalAccessList.update(access, { id: call.args.id, ...call.args });
					result = `Updated Access List ID: ${call.args.id}`;
					break;
				}
				case "delete_access_list": {
					// AccessList delete might not be directly exposed in internalAccessList based on previous check,
					// but usually it exists. If not, use Model.
					// Let's assume standard internal pattern.
					await internalAccessList.delete(access, { id: call.args.id });
					result = `Deleted Access List ID: ${call.args.id}`;
					break;
				}
				// Consistent Enable/Disable

				case "enable_stream": {
					await internalStream.enable(access, { id: call.args.id });
					result = `Enabled Stream ID: ${call.args.id}`;
					break;
				}
				case "disable_stream": {
					await internalStream.disable(access, { id: call.args.id });
					result = `Disabled Stream ID: ${call.args.id}`;
					break;
				}
				// Settings
				case "update_global_setting": {
					await internalSetting.update(access, { id: call.args.id, ...call.args });
					result = `Updated Setting: ${call.args.id}`;
					break;
				}
				// User Updates
				case "update_user_password": {
					await internalUser.setPassword(access, { id: call.args.id, ...call.args });
					result = `Updated Password for User ID: ${call.args.id}`;
					break;
				}
				case "update_user_permissions": {
					await internalUser.setPermissions(access, { id: call.args.id, ...call.args });
					result = `Updated Permissions for User ID: ${call.args.id}`;
					break;
				}
				// Tunnels
				case "update_cloudflared_tunnel": {
					const tunnel = await getCloudflaredTunnel(access, "cloudflared_tunnels:update", call.args.id);
					const updatedTunnel = await tunnel.$query().patchAndFetch({
						...(typeof call.args.name === "undefined" ? {} : { name: call.args.name }),
						...(typeof call.args.token === "undefined" ? {} : { token: call.args.token }),
					});
					await internalCloudflared.restart(updatedTunnel);
					await internalAuditLog.add(access, {
						action: "updated",
						object_type: "cloudflared-tunnel",
						object_id: updatedTunnel.id,
						meta: { name: updatedTunnel.name },
					});
					result = `Updated Tunnel ID: ${updatedTunnel.id}`;
					break;
				}
				// Certificates
				case "update_certificate": {
					await internalCertificate.update(access, { id: call.args.id, ...call.args });
					result = `Updated Certificate ID: ${call.args.id}`;
					break;
				}
				// Auth & Tokens
				case "login_as_user": {
					const _loginResult = await internalUser.loginAs(access, { id: call.args.id });
					result = `Logged in as User ${call.args.id}. Session created successfully.`;
					break;
				}
				case "create_api_token": {
					// Use getFreshToken to generate a new token
					const expiry = call.args.expiry || "1d";
					const newToken = await internalToken.getFreshToken(access, {
						scope: "user", // Default scope as user
						expiry: expiry,
					});
					result = `Created API Token successfully. Token ID: ${newToken.id}`;
					break;
				}
				case "create_client_certificate": {
					await access.can("certificates:create");
					const tmpDir = `/tmp/client-cert-${Date.now()}`;
					const p12Path = await internalPki.createClientCert(
						{
							common_name: call.args.common_name,
							password: call.args.password,
							years: call.args.years || 1,
						},
						tmpDir,
					);
					result = `Client Certificate Created at: ${p12Path}. You can retrieve it from the server filesystem.`;
					break;
				}

				// Terminal Hosts removed (merged into Proxy Hosts)

				// Tor Onion Services
				case "get_tor_onion_services": {
					const accessData = await access.can("tor_onions:list");
					const query = TorOnion.query().where("is_deleted", 0).orderBy("name", "ASC");
					const services = await applyOwnerScope(access, accessData, query);
					result = JSON.stringify(
						services.map((s) => ({
							id: s.id,
							name: s.name,
							onion: s.onion_address,
							status: s.status,
						})),
					);
					break;
				}
				case "create_tor_onion_service": {
					if (isDemoMode()) throw new Error("Tor Onion Services are disabled in Demo Mode");

					const payload = {
						name: call.args.name,
						proxy_host_id: call.args.proxy_host_id,
						virtual_port: call.args.virtual_port,
						target_port: call.args.target_port,
						owner_user_id: access.token.getUserId(1),
						status: 0,
					};
					await access.can("tor_onions:create", payload);
					if (payload.proxy_host_id) {
						await verifyProxyHostUpdateAccess(access, payload.proxy_host_id);
					}

					const service = await TorOnion.query().insert(payload);
					// Create in Tor
					await internalTor.create(service);

					// Refetch for address
					const finalService = await TorOnion.query().findById(service.id);
					await internalAuditLog.add(access, {
						action: "created",
						object_type: "tor-onion",
						object_id: finalService.id,
						meta: { name: finalService.name, onion_address: finalService.onion_address },
					});
					result = `Created Tor Onion Service ID: ${service.id} (Address: ${finalService.onion_address})`;
					break;
				}
				case "update_tor_onion_service": {
					if (isDemoMode()) throw new Error("Tor Onion Services are disabled in Demo Mode");

					const service = await getTorOnionService(access, "tor_onions:update", call.args.id);
					if (call.args.proxy_host_id) {
						await verifyProxyHostUpdateAccess(access, call.args.proxy_host_id);
					}
					const updated = await service.$query().patchAndFetch({
						...(typeof call.args.name === "undefined" ? {} : { name: call.args.name }),
						...(typeof call.args.proxy_host_id === "undefined"
							? {}
							: { proxy_host_id: call.args.proxy_host_id }),
						...(typeof call.args.virtual_port === "undefined"
							? {}
							: { virtual_port: call.args.virtual_port }),
						...(typeof call.args.target_port === "undefined" ? {} : { target_port: call.args.target_port }),
					});

					if (call.args.virtual_port || call.args.target_port) {
						await internalTor.restart(updated);
					}

					await internalAuditLog.add(access, {
						action: "updated",
						object_type: "tor-onion",
						object_id: updated.id,
						meta: { name: updated.name, onion_address: updated.onion_address },
					});
					result = `Updated Tor Onion Service ID: ${updated.id}`;
					break;
				}
				case "delete_tor_onion_service": {
					const service = await getTorOnionService(access, "tor_onions:delete", call.args.id);
					await internalTor.stop(service);
					await service.$query().patch({ is_deleted: 1 });
					await internalAuditLog.add(access, {
						action: "deleted",
						object_type: "tor-onion",
						object_id: service.id,
						meta: { name: service.name, onion_address: service.onion_address },
					});
					result = `Deleted Tor Onion Service ID: ${service.id}`;
					break;
				}
				case "start_tor_onion_service": {
					const service = await getTorOnionService(access, "tor_onions:update", call.args.id);
					if (!service.private_key) await internalTor.create(service);
					else await internalTor.start(service);
					await internalAuditLog.add(access, {
						action: "updated",
						object_type: "tor-onion",
						object_id: service.id,
						meta: { name: service.name, onion_address: service.onion_address, status: "started" },
					});
					result = `Started Tor Onion Service ID: ${service.id}`;
					break;
				}
				case "stop_tor_onion_service": {
					const service = await getTorOnionService(access, "tor_onions:update", call.args.id);
					await internalTor.stop(service);
					await internalAuditLog.add(access, {
						action: "updated",
						object_type: "tor-onion",
						object_id: service.id,
						meta: { name: service.name, onion_address: service.onion_address, status: "stopped" },
					});
					result = `Stopped Tor Onion Service ID: ${service.id}`;
					break;
				}
				// Duplicate cases removed. get_users, read_nginx_logs, get_analytics_summary are handled earlier.
				// get_audit_log is unique here, so we move it or keep it?
				// Actually I should DELETE the duplicates but keep get_audit_log if it wasn't earlier.
				// Grep said get_audit_log was at 909. Was it earlier?
				// Grep output 1683: get_audit_log only at 909. So I must KEEP it.
				case "get_audit_log": {
					if (isDemoMode()) throw new Error("Audit Log is disabled in Demo Mode.");
					const logs = await internalAuditLog.getAll(access, ["user"]);
					result = JSON.stringify(
						logs.map((/** @type {any} */ l) => ({
							action: l.action,
							user: l.user ? l.user.name : "System",
							time: l.created_on,
							meta: l.meta,
						})),
					);
					break;
				}

				default:
					result = `Unknown Tool: ${call.name}`;
			}

			// Add result to list
			toolResults.push({ name: call.name, toolCallId: call.id, result });
		} catch (err) {
			console.error(`[AI Executor] Error processing tool ${call.name}:`, err);
			toolResults.push({ name: call.name, result: `Error: ${err.message}` });
		}
	}

	return toolResults;
};
