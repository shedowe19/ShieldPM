import cookieParser from "cookie-parser";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	audit: vi.fn(),
	login: vi.fn(),
	issue: vi.fn(),
	refresh: vi.fn(),
	verify: vi.fn(),
	load: vi.fn(),
	database: null,
	sso: { enabled: false, enforce_sso: false },
	user: {
		id: 7,
		email: "admin@example.test",
		name: "Admin",
		nickname: "admin",
		avatar: "",
		roles: ["admin"],
	},
}));

vi.mock("../../internal/token.js", () => ({
	default: {
		getTokenFromEmail: state.login,
		issueTokenPair: state.issue,
		refreshTokenPair: state.refresh,
		revokeFamily: vi.fn(),
	},
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: state.audit } }));
vi.mock("../../internal/2fa-service.js", () => ({ default: { verifyLoginChallenge: state.verify } }));
vi.mock("../../models/user-2fa.js", () => ({
	default: { hasActive2FA: async () => false, getActiveForUser: async () => [] },
}));
vi.mock("../../models/token.js", () => ({
	default: () => ({ load: state.load, create: async () => ({ token: "pending-token" }) }),
}));
vi.mock("../../models/setting.js", () => ({
	default: {
		query: () => ({
			where: () => ({ first: async () => ({ meta: state.sso }) }),
		}),
	},
}));
vi.mock("../../models/user.js", async () => {
	const { default: knex } = await import("knex");
	const database = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	state.database = database;
	const query = {
		andWhere: () => query,
		first: async () => state.user,
		// biome-ignore lint/suspicious/noThenProperty: Objection query builders are intentionally thenable.
		then: (resolve) => Promise.resolve(state.user).then(resolve),
	};
	return {
		default: {
			knex: () => database,
			query: () => ({
				whereRaw: () => query,
				andWhere: () => query,
				limit: () => Promise.resolve([state.user]),
				findById: () => query,
			}),
		},
	};
});
vi.mock("../../lib/validator/api.js", () => ({ default: async (_schema, data) => data }));
vi.mock("../../lib/auth-cookies.js", () => ({
	setAuthCookies: vi.fn(),
	clearAuthCookies: vi.fn(),
	clearDuoCookie: vi.fn(),
	readDuoCookie: vi.fn(),
	setDuoCookie: vi.fn(),
}));
vi.mock("../../logger.js", () => ({
	debug: vi.fn(),
	express: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { AUDIT_ACTION } from "../../lib/security-events.js";
import tokens from "../../routes/tokens.js";

let server;
let origin;

beforeAll(async () => {
	await state.database.schema.createTable("login_attempts", (table) => {
		table.increments("id");
		table.string("scope");
		table.string("identifier");
		table.integer("attempt_count");
		table.bigInteger("first_attempt_at");
		table.bigInteger("last_attempt_at");
		table.bigInteger("blocked_until");
		table.unique(["scope", "identifier"]);
	});
	const app = express();
	app.use(express.json(), cookieParser());
	app.use("/api/tokens", tokens);
	app.use((error, _req, res, _next) =>
		res.status(error.status || 500).send({ error: { message: error.public ? error.message : "failed" } }),
	);
	server = app.listen(0, "127.0.0.1");
	await new Promise((resolve) => server.once("listening", resolve));
	origin = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
	server.closeAllConnections();
	await new Promise((resolve) => server.close(resolve));
	await state.database.destroy();
});

beforeEach(async () => {
	vi.clearAllMocks();
	state.sso = { enabled: false, enforce_sso: false };
	state.audit.mockResolvedValue({ id: 1 });
	state.issue.mockResolvedValue({
		access_token: "access-token",
		refresh_token: "refresh-token",
		access_expires: new Date(Date.now() + 900_000).toISOString(),
		refresh_expires: new Date(Date.now() + 86_400_000).toISOString(),
		user: state.user,
	});
	await state.database("login_attempts").delete();
});

const login = (body) =>
	fetch(`${origin}/api/tokens`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

describe("security audit events for authentication", () => {
	it("audits a successful password login with actor and request outcome", async () => {
		state.login.mockResolvedValue({ user: state.user, token: "legacy", expires: new Date().toISOString() });

		const response = await login({ identity: "admin@example.test", secret: "correct horse battery staple" });

		expect(response.status).toBe(200);
		expect(state.audit).toHaveBeenCalledWith(
			null,
			expect.objectContaining({
				action: AUDIT_ACTION.LOGIN_SUCCEEDED,
				object_type: "auth",
				user_id: 7,
				actor_user_id: 7,
				actor_type: "user",
				outcome: "success",
				meta: expect.objectContaining({ method: "password" }),
			}),
		);
	});

	it("audits a failed password login without storing the password", async () => {
		const { default: errs } = await import("../../lib/error.js");
		state.login.mockRejectedValue(new errs.AuthError("Invalid email or password"));

		const response = await login({ identity: "admin@example.test", secret: "wrong-secret-value" });

		expect(response.status).toBe(400);
		const failed = state.audit.mock.calls.find(([, event]) => event.action === AUDIT_ACTION.LOGIN_FAILED);
		expect(failed?.[1]).toMatchObject({
			object_type: "auth",
			outcome: "failure",
			meta: { identifier: "admin@example.test", reason: "invalid_credentials" },
		});
		expect(JSON.stringify(failed?.[1])).not.toContain("wrong-secret-value");
	});

	it("audits a blocked local login when SSO is enforced", async () => {
		state.sso = { enabled: true, enforce_sso: true };

		const response = await login({ identity: "admin@example.test", secret: "secret" });

		expect(response.status).toBe(403);
		expect(state.login).not.toHaveBeenCalled();
		expect(state.audit).toHaveBeenCalledWith(
			null,
			expect.objectContaining({
				action: AUDIT_ACTION.LOGIN_BLOCKED,
				outcome: "denied",
				meta: { reason: "sso_enforced" },
			}),
		);
	});

	it("audits a failed second factor with the login identifier kept out of the record", async () => {
		state.load.mockResolvedValue({ attrs: { id: 7 }, scope: ["2fa_pending"] });
		state.verify.mockResolvedValue(false);

		const response = await fetch(`${origin}/api/tokens/2fa/verify`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ pending_token: "pending", method: "totp", code: "000000" }),
		});

		expect(response.status).toBe(401);
		expect(state.audit).toHaveBeenCalledWith(
			null,
			expect.objectContaining({
				action: AUDIT_ACTION.LOGIN_FAILED,
				object_type: "auth",
				user_id: 7,
				outcome: "failure",
				meta: { method: "password+totp", reason: "invalid_2fa" },
			}),
		);
	});
});
