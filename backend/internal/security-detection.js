import { AUDIT_ACTION, SECURITY_RULE } from "../lib/security-events.js";
import { global as logger } from "../logger.js";
import auditLogModel from "../models/audit-log.js";
import SecurityIncident from "../models/security_incident.js";
import { setAuditObserver } from "./audit-log.js";
import incidents from "./incidents.js";

/**
 * Detection layer for the security audit stream.
 *
 * Rules are intentionally small and data-driven: every rule maps one audited
 * action (plus optional conditions) to one incident with a stable rule id.
 * Incidents are deduplicated per rule and subject for a short window so a
 * brute-force burst or a retry loop creates one actionable row, not hundreds.
 */

const DEFAULT_WINDOW_SECONDS = 15 * 60;
const MAX_DEDUP_KEY_LENGTH = 150;
const severityRank = { low: 1, medium: 2, high: 3, critical: 4 };
const clean = (value, max) => {
	if (value === null || typeof value === "undefined") return null;
	const result = String(value)
		.replace(/\p{Cc}/gu, " ")
		.trim();
	return result ? result.slice(0, max) : null;
};
const positiveInteger = (value) => {
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};
const iso = () => new Date().toISOString();
const maxSeverity = (left, right) => ((severityRank[right] || 0) > (severityRank[left] || 0) ? right : left);

const normalize = (event = {}) => ({
	id: positiveInteger(event.id),
	action: typeof event.action === "string" ? event.action : "",
	objectType: typeof event.object_type === "string" ? event.object_type : "",
	objectId: positiveInteger(event.object_id),
	userId: positiveInteger(event.user_id),
	actorUserId: positiveInteger(event.actor_user_id),
	actorType: clean(event.actor_type, 16),
	ip: clean(event.ip, 45),
	requestId: clean(event.request_id, 64),
	sessionId: clean(event.session_id, 64),
	outcome: clean(event.outcome, 16) || "success",
	meta: event.meta && typeof event.meta === "object" ? event.meta : {},
});

/**
 * A successful login is "new" only when this account has never used this IP
 * before. Comparing against the current row is essential because the audit row
 * is inserted before the observer runs.
 *
 * @param {ReturnType<typeof normalize>} event
 */
const isNewLoginIp = async (event) => {
	if (!event.userId || !event.ip) return false;
	const base = () => {
		const query = auditLogModel
			.query()
			.where("action", AUDIT_ACTION.LOGIN_SUCCEEDED)
			.where("user_id", event.userId)
			.whereNotNull("ip");
		if (event.id) query.whereNot("id", event.id);
		return query;
	};
	const sameIp = await base().where("ip", event.ip).first();
	return !sameIp;
};

/**
 * @typedef {Object} DetectionRule
 * @property {string} id
 * @property {string} title
 * @property {string} notification
 * @property {string | ((event: ReturnType<typeof normalize>) => string)} [severity]
 * @property {number} [windowSeconds]
 * @property {number} [threshold]
 * @property {boolean} [notify]
 * @property {(event: ReturnType<typeof normalize>) => boolean} match
 * @property {(event: ReturnType<typeof normalize>) => boolean | Promise<boolean>} [condition]
 * @property {(event: ReturnType<typeof normalize>) => string} key
 * @property {(event: ReturnType<typeof normalize>, count: number) => string} message
 * @property {(event: ReturnType<typeof normalize>) => Record<string, any>} [details]
 * @property {(event: ReturnType<typeof normalize>) => number | null} [owner]
 */

/** @type {DetectionRule[]} */
const rules = [
	{
		id: SECURITY_RULE.FAILED_LOGIN,
		title: "Repeated failed password logins",
		notification: "security.login_failed",
		severity: "high",
		threshold: 5,
		windowSeconds: 15 * 60,
		match: (event) => event.action === AUDIT_ACTION.LOGIN_FAILED,
		key: (event) => `ip:${event.ip || "unknown"}`,
		message: (event, count) =>
			`${count} failed password login(s) for ${clean(event.meta.identifier, 120) || "unknown account"} from ${event.ip || "unknown IP"}`,
		details: (event) => ({
			identifier: clean(event.meta.identifier, 120),
			reason: clean(event.meta.reason, 80),
		}),
	},
	{
		id: SECURITY_RULE.NEW_LOGIN_IP,
		title: "Login from a previously unseen IP address",
		notification: "security.login_new_ip",
		severity: "medium",
		match: (event) => event.action === AUDIT_ACTION.LOGIN_SUCCEEDED,
		condition: isNewLoginIp,
		key: (event) => `user:${event.userId || 0}:ip:${event.ip || "unknown"}`,
		message: (event) => `User ${event.userId || "unknown"} signed in from a new IP ${event.ip || "unknown"}`,
		details: (event) => ({ method: clean(event.meta.method, 32) }),
		owner: (event) => event.userId,
	},
	{
		id: SECURITY_RULE.OIDC_FAILURE,
		title: "Repeated OIDC login failures",
		notification: "security.oidc_login_failed",
		severity: "high",
		threshold: 5,
		windowSeconds: 15 * 60,
		match: (event) => event.action === AUDIT_ACTION.OIDC_LOGIN_FAILED,
		key: (event) => `ip:${event.ip || "unknown"}`,
		message: (event, count) => `${count} OIDC login failure(s) from ${event.ip || "unknown IP"}`,
		details: (event) => ({ reason: clean(event.meta.reason, 120) }),
	},
	{
		id: SECURITY_RULE.REFRESH_REPLAY,
		title: "Refresh token replay detected",
		notification: "security.refresh_replay",
		severity: "high",
		// `auth-session-service` already delivers this alert synchronously; the
		// rule only persists the in-product incident to avoid double delivery.
		notify: false,
		match: (event) => event.action === AUDIT_ACTION.REFRESH_REPLAY_DETECTED,
		key: (event) => `family:${clean(event.meta.family_id, 80) || event.sessionId || "unknown"}`,
		message: (event) =>
			`Refresh token replay for user ${event.userId || "unknown"}; the session family was revoked`,
		details: (event) => ({
			family_id: clean(event.meta.family_id, 80),
			revoked_reason: clean(event.meta.revoked_reason, 80),
		}),
		owner: (event) => event.userId,
	},
	{
		id: SECURITY_RULE.MFA_DISABLED,
		title: "Two-factor authentication removed",
		notification: "security.2fa_disabled",
		severity: "high",
		match: (event) => event.action === AUDIT_ACTION.TWO_FACTOR_DISABLED,
		key: (event) => `user:${event.objectId || event.userId || 0}`,
		message: (event) =>
			`A two-factor authentication method was removed from user ${event.objectId || event.userId}`,
		details: (event) => ({ method_id: positiveInteger(event.meta.method_id) }),
		owner: (event) => event.objectId || event.userId,
	},
	{
		id: SECURITY_RULE.MFA_ENABLED,
		title: "Two-factor authentication enabled",
		notification: "security.2fa_enabled",
		severity: "medium",
		match: (event) => event.action === AUDIT_ACTION.TWO_FACTOR_ENABLED,
		key: (event) => `user:${event.objectId || event.userId || 0}`,
		message: (event) =>
			`A ${clean(event.meta.method, 24) || "new"} two-factor method was enabled for user ${event.objectId || event.userId}`,
		details: (event) => ({ method: clean(event.meta.method, 24) }),
		owner: (event) => event.objectId || event.userId,
	},
	{
		id: SECURITY_RULE.ROLE_CHANGE,
		title: "Account roles changed",
		notification: "security.roles_changed",
		severity: (event) => (event.meta.granted_admin === true ? "high" : "medium"),
		match: (event) => event.action === AUDIT_ACTION.USER_ROLES_CHANGED,
		key: (event) => `user:${event.objectId || event.userId || 0}`,
		message: (event) =>
			`Roles changed for user ${event.objectId || event.userId}: ${Array.isArray(event.meta.roles) ? event.meta.roles.join(", ") || "none" : "unknown"}`,
		details: (event) => ({
			roles: Array.isArray(event.meta.roles) ? event.meta.roles.slice(0, 20) : [],
			previous_roles: Array.isArray(event.meta.previous_roles) ? event.meta.previous_roles.slice(0, 20) : [],
			granted_admin: event.meta.granted_admin === true,
		}),
		owner: (event) => event.objectId || event.userId,
	},
	{
		id: SECURITY_RULE.PERMISSION_CHANGE,
		title: "Account permissions changed",
		notification: "security.permissions_changed",
		severity: "medium",
		match: (event) => event.action === AUDIT_ACTION.USER_PERMISSIONS_CHANGED,
		key: (event) => `user:${event.objectId || event.userId || 0}`,
		message: (event) => `Permissions changed for user ${event.objectId || event.userId}`,
		details: (event) => ({ visibility: clean(event.meta.permissions?.visibility, 24) }),
		owner: (event) => event.objectId || event.userId,
	},
	{
		id: SECURITY_RULE.PASSWORD_CHANGE,
		title: "Password or authentication factor changed",
		notification: "security.password_changed",
		severity: "medium",
		match: (event) =>
			event.action === AUDIT_ACTION.USER_UPDATED &&
			event.objectType === "user" &&
			event.meta.password_changed === true,
		key: (event) => `user:${event.objectId || event.userId || 0}`,
		message: (event) => `The password authentication factor was changed for user ${event.objectId || event.userId}`,
		details: (event) => ({ auth_type: clean(event.meta.auth_type, 16) }),
		owner: (event) => event.objectId || event.userId,
	},
	{
		id: SECURITY_RULE.LOGIN_BLOCKED,
		title: "Local login blocked by policy",
		notification: "security.login_blocked",
		severity: "medium",
		match: (event) => event.action === AUDIT_ACTION.LOGIN_BLOCKED,
		key: (event) => `ip:${event.ip || "unknown"}`,
		message: (event) =>
			`A local login from ${event.ip || "unknown IP"} was blocked: ${clean(event.meta.reason, 120) || "policy"}`,
		details: (event) => ({ reason: clean(event.meta.reason, 120) }),
	},
	{
		id: SECURITY_RULE.TOKEN_IP_CHANGE,
		title: "Session refreshed from a new IP address",
		notification: "security.token_new_ip",
		severity: "medium",
		match: (event) => event.action === AUDIT_ACTION.TOKEN_REFRESHED,
		condition: (event) => event.meta.ip_changed === true,
		key: (event) => `family:${clean(event.meta.family_id, 80) || event.sessionId || "unknown"}`,
		message: (event) =>
			`The refresh family of user ${event.userId || "unknown"} was used from a new IP ${event.ip || "unknown"}`,
		details: (event) => ({
			family_id: clean(event.meta.family_id, 80),
			source_ip: clean(event.meta.source_ip, 45),
		}),
		owner: (event) => event.userId,
	},
	{
		id: SECURITY_RULE.BACKUP_DOWNLOAD,
		title: "Instance backup downloaded",
		notification: "security.backup_downloaded",
		severity: "high",
		windowSeconds: 60 * 60,
		match: (event) =>
			event.action === AUDIT_ACTION.BACKUP_DOWNLOADED &&
			event.objectType === "setting" &&
			event.meta.setting_id === "instance-backups",
		key: (event) => `actor:${event.actorUserId || 0}:ip:${event.ip || "unknown"}`,
		message: (event) => `Instance backup ${clean(event.meta.backup_id, 40) || ""} was downloaded`,
		details: (event) => ({ backup_id: clean(event.meta.backup_id, 40), size: positiveInteger(event.meta.size) }),
	},
	{
		id: SECURITY_RULE.CERTIFICATE_DOWNLOAD,
		title: "Certificate and private key downloaded",
		notification: "security.certificate_downloaded",
		severity: "high",
		windowSeconds: 60 * 60,
		match: (event) => event.action === AUDIT_ACTION.CERTIFICATE_DOWNLOADED && event.objectType === "certificate",
		key: (event) => `certificate:${event.objectId || 0}:actor:${event.actorUserId || 0}`,
		message: (event) =>
			`Certificate ${event.objectId || "unknown"} (${clean(event.meta.name, 120) || "unnamed"}) was downloaded with its private key`,
		details: (event) => ({
			provider: clean(event.meta.provider, 24),
			file_count: positiveInteger(event.meta.file_count),
		}),
	},
	{
		id: SECURITY_RULE.WIREGUARD_EXPORT,
		title: "WireGuard configuration exported",
		notification: "security.wireguard_export",
		severity: "high",
		windowSeconds: 60 * 60,
		match: (event) =>
			event.action === AUDIT_ACTION.WIREGUARD_CONFIG_EXPORTED && event.objectType === "wireguard-peer",
		key: (event) => `peer:${event.objectId || 0}:actor:${event.actorUserId || 0}`,
		message: (event) =>
			`WireGuard ${clean(event.meta.format, 16) || "configuration"} was exported for peer ${event.objectId || "unknown"}`,
		details: (event) => ({ format: clean(event.meta.format, 16), peer_name: clean(event.meta.name, 120) }),
	},
	{
		id: SECURITY_RULE.ROOT_CA_DOWNLOAD,
		title: "Internal root CA certificate downloaded",
		notification: "security.root_ca_downloaded",
		severity: "medium",
		windowSeconds: 60 * 60,
		match: (event) => event.action === AUDIT_ACTION.CERTIFICATE_ROOT_CA_DOWNLOADED,
		key: (event) => `actor:${event.actorUserId || 0}:ip:${event.ip || "unknown"}`,
		message: () => "The internal root CA certificate was downloaded",
	},
	{
		id: SECURITY_RULE.TERMINAL_OPEN,
		title: "Terminal session opened",
		notification: "security.terminal_opened",
		severity: "high",
		match: (event) =>
			event.action === AUDIT_ACTION.TERMINAL_OPENED || event.action === AUDIT_ACTION.TERMINAL_DENIED,
		key: (event) => `host:${event.objectId || 0}:ip:${event.ip || "unknown"}`,
		message: (event) =>
			event.action === AUDIT_ACTION.TERMINAL_DENIED
				? `A terminal connection to host ${event.objectId || "unknown"} was denied`
				: `A terminal session was opened on host ${event.objectId || "unknown"} from ${event.ip || "unknown IP"}`,
		details: (event) => ({ host_id: event.objectId, outcome: event.outcome }),
	},
	{
		id: SECURITY_RULE.GITOPS_IMPORT,
		title: "GitOps configuration imported",
		notification: "security.gitops_import",
		severity: (event) => (event.outcome === "success" ? "high" : "medium"),
		match: (event) =>
			event.action === AUDIT_ACTION.GITOPS_IMPORTED &&
			event.objectType === "setting" &&
			event.meta.setting_id === "gitops-config",
		key: () => "gitops:import",
		message: (event, count) =>
			`GitOps import ${event.outcome === "success" ? "applied" : "failed"}: ${count} event(s) in this window`,
		details: (event) => ({
			imported: event.meta.imported ?? null,
			deleted: event.meta.deleted ?? null,
			errors: event.meta.errors ?? null,
		}),
	},
	{
		id: SECURITY_RULE.GITOPS_PULL,
		title: "GitOps pull from remote",
		notification: "security.gitops_pull",
		severity: "medium",
		match: (event) =>
			event.action === AUDIT_ACTION.GITOPS_PULLED &&
			event.objectType === "setting" &&
			event.meta.setting_id === "gitops-config",
		key: () => "gitops:pull",
		message: (event) => `GitOps pull ${event.outcome === "success" ? "completed" : "failed"}`,
		details: (event) => ({ branch: clean(event.meta.branch, 120) }),
	},
	{
		id: SECURITY_RULE.GIT_DEPLOY_SYNC,
		title: "Git-Deploy content synchronized",
		notification: "security.git_deploy_sync",
		severity: "high",
		match: (event) => event.action === AUDIT_ACTION.GIT_DEPLOY_SYNCED && event.objectType === "proxy-host",
		key: (event) => `host:${event.objectId || 0}`,
		message: (event) =>
			`Git-Deploy synchronized host ${event.objectId || "unknown"} to ${clean(event.meta.commit, 40) || "a new commit"}`,
		details: (event) => ({ commit: clean(event.meta.commit, 40), branch: clean(event.meta.branch, 120) }),
	},
	{
		id: SECURITY_RULE.DOCKER_DISCOVERY,
		title: "Docker auto-discovered a proxy host",
		notification: "security.docker_discovery",
		severity: "medium",
		match: (event) =>
			event.action === AUDIT_ACTION.DOCKER_DISCOVERED &&
			event.objectType === "proxy-host" &&
			event.meta.auto_discovered === true,
		key: (event) => `host:${event.objectId || 0}`,
		message: (event) => `Docker discovery created or changed proxy host ${event.objectId || "unknown"}`,
		details: (event) => ({ container: clean(event.meta.docker_container_id, 80) }),
	},
	{
		id: SECURITY_RULE.WAF_DISABLED,
		title: "WAF or CrowdSec disabled on a proxy host",
		notification: "security.waf_disabled",
		severity: "high",
		windowSeconds: 60 * 60,
		match: (event) =>
			event.action === AUDIT_ACTION.PROXY_HOST_UPDATED &&
			event.objectType === "proxy-host" &&
			(event.meta.block_exploits === 0 || event.meta.block_exploits === false) &&
			(event.meta.security_crowdsec === 0 || event.meta.security_crowdsec === false),
		key: (event) => `host:${event.objectId || 0}`,
		message: (event) => `WAF and CrowdSec are both disabled on proxy host ${event.objectId || "unknown"}`,
		details: (event) => ({
			block_exploits: event.meta.block_exploits,
			security_crowdsec: event.meta.security_crowdsec,
		}),
	},
	{
		id: SECURITY_RULE.CHATOPS_ACTION,
		title: "ChatOps command or denied attempt",
		notification: "security.chatops_action",
		severity: (event) => (event.outcome === "denied" ? "high" : "medium"),
		match: (event) =>
			event.action === AUDIT_ACTION.CHATOPS_COMMAND &&
			(event.outcome === "denied" || event.meta.requires_confirmation === true),
		key: (event) =>
			`integration:${event.objectId || 0}:telegram:${clean(event.meta.telegram_user_id, 32) || "unknown"}`,
		message: (event) =>
			event.outcome === "denied"
				? `An unauthorized ChatOps request was rejected for integration ${event.objectId || "unknown"}`
				: `ChatOps requested a state-changing action for integration ${event.objectId || "unknown"}`,
		details: (event) => ({
			telegram_user_id: clean(event.meta.telegram_user_id, 32),
			requires_confirmation: event.meta.requires_confirmation === true,
		}),
		owner: (event) => event.userId,
	},
	{
		id: SECURITY_RULE.ACME_ISSUE,
		title: "ACME certificate issued or renewed",
		notification: "security.acme_issue",
		severity: (event) => (event.action === AUDIT_ACTION.CERTIFICATE_RENEW_FAILED ? "high" : "medium"),
		windowSeconds: 60 * 60,
		match: (event) =>
			event.objectType === "certificate" &&
			(event.action === AUDIT_ACTION.CERTIFICATE_CREATED ||
				event.action === AUDIT_ACTION.CERTIFICATE_RENEWED ||
				event.action === AUDIT_ACTION.CERTIFICATE_RENEW_FAILED),
		key: (event) => `certificate:${event.objectId || 0}`,
		message: (event) =>
			event.action === AUDIT_ACTION.CERTIFICATE_RENEW_FAILED
				? `Certificate renewal failed${event.meta.domain ? ` for ${clean(event.meta.domain, 160)}` : ""}`
				: `Certificate ${event.objectId || "unknown"} was ${event.action === AUDIT_ACTION.CERTIFICATE_CREATED ? "issued" : "renewed"}`,
		details: (event) => ({
			provider: clean(event.meta.provider, 24),
			auto: event.meta.auto === true,
			domain_names: Array.isArray(event.meta.domain_names) ? event.meta.domain_names.slice(0, 50) : [],
		}),
	},
	{
		id: SECURITY_RULE.CLOUDFLARED_TOKEN,
		title: "Cloudflare tunnel token rotated",
		notification: "security.cloudflared_token",
		severity: "high",
		match: (event) =>
			event.action === AUDIT_ACTION.CLOUDFLARED_UPDATED &&
			event.objectType === "cloudflared-tunnel" &&
			event.meta.token_changed === true,
		key: (event) => `tunnel:${event.objectId || 0}`,
		message: (event) => `The connector token of Cloudflare tunnel ${event.objectId || "unknown"} was replaced`,
		details: (event) => ({ name: clean(event.meta.name, 120) }),
	},
];

/**
 * @param {ReturnType<typeof normalize>} event
 */
const findRule = async (event) => {
	for (const rule of rules) {
		if (!rule.match(event)) continue;
		if (rule.condition && !(await rule.condition(event))) continue;
		return rule;
	}
	return null;
};

/**
 * Resolve the notification recipients: the affected user when the rule names
 * one, plus administrators through `incidents.securityAlert`.
 *
 * @param {DetectionRule} rule
 * @param {ReturnType<typeof normalize>} event
 */
const ownerFor = (rule, event) => {
	if (typeof rule.owner === "function") return rule.owner(event);
	return event.userId || event.actorUserId || null;
};

/**
 * Convert one audit row into an in-product security incident. Returns `null`
 * when no rule matches. Never throws for a malformed row.
 *
 * @param {Record<string, any>} auditEvent
 * @returns {Promise<{incident: any, rule_id: string, created: boolean, notified: boolean} | null>}
 */
export const observe = async (auditEvent) => {
	const event = normalize(auditEvent);
	if (!event.action) return null;

	const rule = await findRule(event);
	if (!rule) return null;

	const now = iso();
	const windowSeconds = rule.windowSeconds || DEFAULT_WINDOW_SECONDS;
	const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();
	const dedupKey = clean(`${rule.id}:${rule.key(event)}`, MAX_DEDUP_KEY_LENGTH);
	const configuredSeverity = typeof rule.severity === "function" ? rule.severity(event) : rule.severity || "medium";
	const initialSeverity = rule.threshold ? "low" : configuredSeverity;

	const existing = await SecurityIncident.query()
		.where("dedup_key", dedupKey)
		.whereNot("status", "resolved")
		.where("last_seen_at", ">=", windowStart)
		.orderBy("id", "desc")
		.first();

	let incident;
	let created = false;
	let notified = false;

	if (existing) {
		const count = Number(existing.count || 0) + 1;
		const reachedThreshold = Boolean(rule.threshold && count >= rule.threshold);
		const severity = maxSeverity(existing.severity, reachedThreshold ? configuredSeverity : initialSeverity);
		const shouldNotify = rule.notify !== false && reachedThreshold && Number(existing.count || 0) < rule.threshold;
		incident = await existing.$query().patchAndFetch({
			last_seen_at: now,
			count,
			severity,
			message: clean(rule.message(event, count), 255),
			ip: event.ip || existing.ip,
			request_id: event.requestId || existing.request_id,
			session_id: event.sessionId || existing.session_id,
			audit_log_id: event.id || existing.audit_log_id,
			meta: { ...(existing.meta || {}), ...(rule.details?.(event) || {}) },
		});
		notified = shouldNotify ? await notify(rule, event, incident, severity) : false;
	} else {
		const row = {
			created_on: now,
			last_seen_at: now,
			rule_id: rule.id,
			severity: initialSeverity,
			status: "open",
			dedup_key: dedupKey,
			title: clean(rule.title, 160),
			message: clean(rule.message(event, 1), 255),
			actor_user_id: event.actorUserId,
			actor_type: event.actorType,
			user_id: event.userId,
			ip: event.ip,
			request_id: event.requestId,
			session_id: event.sessionId,
			audit_log_id: event.id,
			count: 1,
			meta: rule.details?.(event) || {},
		};
		incident = await SecurityIncident.query().insert(/** @type {any} */ (row));
		created = true;
		const thresholdReached = !rule.threshold || rule.threshold <= 1;
		if (rule.notify !== false && thresholdReached) {
			notified = await notify(rule, event, incident, initialSeverity);
		}
	}

	return { incident, rule_id: rule.id, created, notified };
};

/**
 * @param {DetectionRule} rule
 * @param {ReturnType<typeof normalize>} event
 * @param {any} incident
 * @param {string} severity
 */
const notify = async (rule, event, incident, severity) => {
	try {
		const delivered = await incidents.securityAlert({
			owner_user_id: ownerFor(rule, event),
			event: rule.notification,
			severity,
			message: `${rule.id}: ${clean(rule.message(event, Number(incident.count || 1)), 240)}`,
			meta: {
				rule_id: rule.id,
				security_incident_id: incident.id,
				action: event.action,
				object_type: event.objectType,
				object_id: event.objectId,
				actor_user_id: event.actorUserId,
				request_id: event.requestId,
			},
		});
		return delivered > 0;
	} catch (error) {
		logger.error(`[Detection] Notification for ${rule.id} failed: ${error?.message}`);
		return false;
	}
};

let installed = false;

/**
 * Wire the detection observer into the audit writer. Called once during
 * startup after migrations, so audit-only tests never load this module.
 */
export const install = () => {
	if (installed) return;
	installed = true;
	setAuditObserver(async (row) => {
		await observe(row);
	});
};

/** @internal exported for tests */
export const _rules = rules;

export default { observe, install, rules };
