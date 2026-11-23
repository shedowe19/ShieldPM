import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ database: null, send: vi.fn() }));

vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.database = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.database };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => true,
	isPostgres: () => false,
	isDemoMode: () => false,
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../lib/encryption.js", () => ({ decrypt: (value) => value, encrypt: (value) => value }));
vi.mock("../../lib/notification-http.js", () => ({
	deliverNotification: state.send,
	validateNotificationUrl: vi.fn(),
}));

import incidentsService from "../../internal/incidents.js";
import { observe } from "../../internal/security-detection.js";
import { AUDIT_ACTION, SECURITY_RULE } from "../../lib/security-events.js";

let sequence = 0;
const event = (overrides = {}) => ({
	id: ++sequence,
	action: AUDIT_ACTION.LOGIN_SUCCEEDED,
	object_type: "auth",
	object_id: 0,
	user_id: 7,
	actor_user_id: 7,
	actor_type: "user",
	outcome: "success",
	ip: "203.0.113.10",
	request_id: "request-12345678",
	session_id: "family-1",
	meta: {},
	...overrides,
});

beforeAll(async () => {
	await state.database.schema.createTable("audit_log", (table) => {
		table.increments("id");
		table.string("created_on");
		table.string("modified_on");
		table.integer("user_id");
		table.string("object_type");
		table.integer("object_id");
		table.string("action");
		table.text("meta");
		table.string("ip");
		table.string("user_agent");
		table.string("session_id");
		table.string("request_id");
		table.string("outcome");
		table.integer("actor_user_id");
		table.string("actor_type");
		table.string("jti");
	});
	await state.database.schema.createTable("security_incident", (table) => {
		table.increments("id");
		table.string("created_on");
		table.string("last_seen_at");
		table.string("rule_id");
		table.string("severity");
		table.string("status");
		table.string("dedup_key");
		table.string("title");
		table.string("message");
		table.integer("actor_user_id");
		table.string("actor_type");
		table.integer("user_id");
		table.string("ip");
		table.string("request_id");
		table.string("session_id");
		table.integer("audit_log_id");
		table.integer("count");
		table.text("meta");
		table.string("resolved_at");
	});
	await state.database.schema.createTable("user", (table) => {
		table.increments("id");
		table.text("roles");
		table.integer("is_deleted").defaultTo(0);
		table.integer("is_disabled").defaultTo(0);
	});
	await state.database.schema.createTable("notification_target", (table) => {
		table.increments("id");
		table.integer("owner_user_id");
		table.string("name");
		table.string("type");
		table.boolean("enabled").defaultTo(1);
		table.text("host_ids");
		table.text("secret");
		table.integer("version");
		table.string("created_on");
		table.string("modified_on");
	});
});

afterAll(async () => state.database.destroy());

beforeEach(async () => {
	state.send.mockReset().mockResolvedValue(204);
	await Promise.all(
		["audit_log", "security_incident", "notification_target", "user"].map((table) =>
			state.database(table).delete(),
		),
	);
});

const target = (owner = 1) => ({
	owner_user_id: owner,
	name: "Security webhook",
	type: "webhook",
	enabled: 1,
	host_ids: JSON.stringify([]),
	secret: JSON.stringify({ url: "https://notify.example/hook", token: "" }),
	version: 1,
	created_on: new Date().toISOString(),
	modified_on: new Date().toISOString(),
});

const incidents = () => state.database("security_incident").orderBy("id");

describe("security detection rules", () => {
	it("aggregates failed logins and only alerts when the threshold is reached", async () => {
		await state.database("user").insert({ id: 1, roles: JSON.stringify(["admin"]), is_deleted: 0 });
		await state.database("notification_target").insert(target());

		for (let attempt = 1; attempt <= 4; attempt += 1) {
			await observe(
				event({
					action: AUDIT_ACTION.LOGIN_FAILED,
					user_id: 0,
					actor_user_id: 0,
					actor_type: "anonymous",
					outcome: "failure",
					meta: { identifier: "admin@example.test", reason: "invalid_credentials" },
				}),
			);
		}

		let rows = await incidents();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			rule_id: SECURITY_RULE.FAILED_LOGIN,
			severity: "low",
			count: 4,
			ip: "203.0.113.10",
		});
		expect(state.send).not.toHaveBeenCalled();

		await observe(
			event({
				action: AUDIT_ACTION.LOGIN_FAILED,
				user_id: 0,
				actor_user_id: 0,
				actor_type: "anonymous",
				outcome: "failure",
				meta: { identifier: "admin@example.test", reason: "invalid_credentials" },
			}),
		);

		rows = await incidents();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ severity: "high", count: 5 });
		expect(state.send).toHaveBeenCalledTimes(1);
		expect(state.send).toHaveBeenCalledWith(
			expect.objectContaining({ owner_user_id: 1 }),
			expect.anything(),
			expect.objectContaining({
				event: "security.login_failed",
				severity: "high",
				state: "security",
				rule_id: SECURITY_RULE.FAILED_LOGIN,
			}),
			expect.any(Number),
			undefined,
		);
	});

	it.each([
		[
			{
				action: AUDIT_ACTION.BACKUP_DOWNLOADED,
				object_type: "setting",
				meta: { setting_id: "instance-backups" },
			},
			SECURITY_RULE.BACKUP_DOWNLOAD,
			"high",
		],
		[
			{
				action: AUDIT_ACTION.CERTIFICATE_DOWNLOADED,
				object_type: "certificate",
				object_id: 12,
				meta: { name: "tls" },
			},
			SECURITY_RULE.CERTIFICATE_DOWNLOAD,
			"high",
		],
		[
			{
				action: AUDIT_ACTION.WIREGUARD_CONFIG_EXPORTED,
				object_type: "wireguard-peer",
				object_id: 4,
				meta: { format: "config" },
			},
			SECURITY_RULE.WIREGUARD_EXPORT,
			"high",
		],
		[
			{ action: AUDIT_ACTION.CERTIFICATE_ROOT_CA_DOWNLOADED, object_type: "certificate", object_id: 0 },
			SECURITY_RULE.ROOT_CA_DOWNLOAD,
			"medium",
		],
		[
			{ action: AUDIT_ACTION.TERMINAL_OPENED, object_type: "terminal", object_id: 3 },
			SECURITY_RULE.TERMINAL_OPEN,
			"high",
		],
		[
			{
				action: AUDIT_ACTION.GITOPS_IMPORTED,
				object_type: "setting",
				meta: { setting_id: "gitops-config", imported: 2 },
			},
			SECURITY_RULE.GITOPS_IMPORT,
			"high",
		],
		[
			{ action: AUDIT_ACTION.GITOPS_PULLED, object_type: "setting", meta: { setting_id: "gitops-config" } },
			SECURITY_RULE.GITOPS_PULL,
			"medium",
		],
		[
			{
				action: AUDIT_ACTION.GIT_DEPLOY_SYNCED,
				object_type: "proxy-host",
				object_id: 8,
				meta: { commit: "abc" },
			},
			SECURITY_RULE.GIT_DEPLOY_SYNC,
			"high",
		],
		[
			{
				action: AUDIT_ACTION.DOCKER_DISCOVERED,
				object_type: "proxy-host",
				object_id: 9,
				meta: { auto_discovered: true },
			},
			SECURITY_RULE.DOCKER_DISCOVERY,
			"medium",
		],
		[
			{
				action: AUDIT_ACTION.PROXY_HOST_UPDATED,
				object_type: "proxy-host",
				object_id: 10,
				meta: { block_exploits: 0, security_crowdsec: 0 },
			},
			SECURITY_RULE.WAF_DISABLED,
			"high",
		],
		[
			{ action: AUDIT_ACTION.CHATOPS_COMMAND, object_type: "chat-integration", object_id: 2, outcome: "denied" },
			SECURITY_RULE.CHATOPS_ACTION,
			"high",
		],
		[
			{
				action: AUDIT_ACTION.CLOUDFLARED_UPDATED,
				object_type: "cloudflared-tunnel",
				object_id: 5,
				meta: { token_changed: true },
			},
			SECURITY_RULE.CLOUDFLARED_TOKEN,
			"high",
		],
		[
			{ action: AUDIT_ACTION.CERTIFICATE_CREATED, object_type: "certificate", object_id: 11 },
			SECURITY_RULE.ACME_ISSUE,
			"medium",
		],
		[
			{ action: AUDIT_ACTION.CERTIFICATE_RENEW_FAILED, object_type: "certificate", object_id: 11 },
			SECURITY_RULE.ACME_ISSUE,
			"high",
		],
		[
			{ action: AUDIT_ACTION.TWO_FACTOR_DISABLED, object_type: "user", object_id: 7, meta: { method_id: 3 } },
			SECURITY_RULE.MFA_DISABLED,
			"high",
		],
		[
			{ action: AUDIT_ACTION.TWO_FACTOR_ENABLED, object_type: "user", object_id: 7, meta: { method: "totp" } },
			SECURITY_RULE.MFA_ENABLED,
			"medium",
		],
		[
			{
				action: AUDIT_ACTION.USER_ROLES_CHANGED,
				object_type: "user",
				object_id: 7,
				meta: { roles: ["admin"], previous_roles: [], granted_admin: true },
			},
			SECURITY_RULE.ROLE_CHANGE,
			"high",
		],
		[
			{ action: AUDIT_ACTION.USER_PERMISSIONS_CHANGED, object_type: "user", object_id: 7 },
			SECURITY_RULE.PERMISSION_CHANGE,
			"medium",
		],
		[
			{
				action: AUDIT_ACTION.USER_UPDATED,
				object_type: "user",
				object_id: 7,
				meta: { password_changed: true, auth_type: "password" },
			},
			SECURITY_RULE.PASSWORD_CHANGE,
			"medium",
		],
		[
			{ action: AUDIT_ACTION.LOGIN_BLOCKED, object_type: "auth", user_id: 0, meta: { reason: "sso_enforced" } },
			SECURITY_RULE.LOGIN_BLOCKED,
			"medium",
		],
		[
			{
				action: AUDIT_ACTION.TOKEN_REFRESHED,
				object_type: "auth-session",
				meta: { family_id: "family-1", ip_changed: true },
			},
			SECURITY_RULE.TOKEN_IP_CHANGE,
			"medium",
		],
	])("maps %o to %s with severity %s", async (overrides, ruleId, severity) => {
		const result = await observe(event(overrides));
		expect(result).toMatchObject({ rule_id: ruleId });
		const rows = await incidents();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ rule_id: ruleId, severity, count: 1 });
	});

	it("deduplicates an export within the rule window and notifies only once", async () => {
		await state.database("user").insert({ id: 1, roles: JSON.stringify(["admin"]), is_deleted: 0 });
		await state.database("notification_target").insert(target());

		const download = {
			action: AUDIT_ACTION.CERTIFICATE_DOWNLOADED,
			object_type: "certificate",
			object_id: 12,
			meta: { name: "tls" },
		};
		await observe(event(download));
		const second = await observe(event(download));

		expect(second).toMatchObject({ created: false, notified: false });
		const rows = await incidents();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ rule_id: SECURITY_RULE.CERTIFICATE_DOWNLOAD, count: 2 });
		expect(state.send).toHaveBeenCalledTimes(1);
	});

	it("persists refresh replay without sending a second notification", async () => {
		await state.database("user").insert({ id: 1, roles: JSON.stringify(["admin"]), is_deleted: 0 });
		await state.database("notification_target").insert(target());

		const result = await observe(
			event({
				action: AUDIT_ACTION.REFRESH_REPLAY_DETECTED,
				object_type: "auth-session",
				outcome: "denied",
				meta: { family_id: "family-1", revoked_reason: "refresh_token_replay_detected" },
			}),
		);

		expect(result).toMatchObject({ rule_id: SECURITY_RULE.REFRESH_REPLAY, notified: false });
		expect(await incidents()).toHaveLength(1);
		expect(state.send).not.toHaveBeenCalled();
	});

	it("raises a new-login-IP incident only when the account has never used that IP", async () => {
		const now = new Date().toISOString();
		await state.database("audit_log").insert({
			id: 1,
			created_on: now,
			modified_on: now,
			action: AUDIT_ACTION.LOGIN_SUCCEEDED,
			object_type: "auth",
			user_id: 7,
			ip: "198.51.100.1",
			outcome: "success",
			meta: "{}",
		});

		// Same IP as a previous login: not a new-device signal.
		await expect(observe(event({ id: 2, ip: "198.51.100.1" }))).resolves.toBeNull();

		// A different IP is new for this account.
		const result = await observe(event({ id: 3, ip: "198.51.100.2" }));
		expect(result).toMatchObject({ rule_id: SECURITY_RULE.NEW_LOGIN_IP });
		expect((await incidents())[0]).toMatchObject({ severity: "medium", ip: "198.51.100.2" });
	});

	it("starts a new incident after the deduplication window", async () => {
		const download = {
			action: AUDIT_ACTION.CERTIFICATE_DOWNLOADED,
			object_type: "certificate",
			object_id: 12,
		};
		await observe(event(download));
		await state.database("security_incident").update({ last_seen_at: "2020-01-01T00:00:00.000Z" });
		const result = await observe(event(download));

		expect(result).toMatchObject({ created: true });
		expect(await incidents()).toHaveLength(2);
	});

	it("ignores events without a rule", async () => {
		await expect(
			observe(event({ action: "updated", object_type: "proxy-host", object_id: 1, meta: { note: "unchanged" } })),
		).resolves.toBeNull();
		expect(await incidents()).toHaveLength(0);
	});

	it("lists and resolves incidents only for audit-log readers", async () => {
		await observe(event({ action: AUDIT_ACTION.TWO_FACTOR_DISABLED, object_type: "user", object_id: 7 }));
		const denied = {
			can: async () => {
				throw new Error("denied");
			},
		};
		await expect(incidentsService.securityIncidents(denied)).rejects.toThrow("denied");

		const access = { can: async () => true, token: { getUserId: () => 1 } };
		const rows = await incidentsService.securityIncidents(access);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ rule_id: SECURITY_RULE.MFA_DISABLED, status: "open" });

		const resolved = await incidentsService.resolveSecurityIncident(access, rows[0].id);
		expect(resolved).toMatchObject({ status: "resolved" });
		expect(resolved.resolved_at).toEqual(expect.any(String));
		expect(await incidentsService.securityIncidents(access, { status: "resolved" })).toHaveLength(1);
	});
});
