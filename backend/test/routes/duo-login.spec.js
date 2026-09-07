import crypto from "node:crypto";
import knex from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	db: null,
	pendingExpires: 0,
	exchange: vi.fn(),
	issuePair: vi.fn(),
}));

// Keep real Express, cookie/CSRF middleware, token routes, 2FA service and SQL
// operations. Only provider networking, unrelated application services and the
// model connection are replaced with isolated fixtures.
vi.mock("../../models/user-2fa.js", async () => {
	const { Model } = await import("objection");
	class TwoFa extends Model {
		static get tableName() {
			return "user_2fa";
		}
		static get jsonAttributes() {
			return ["meta"];
		}
	}
	return { default: { query: () => TwoFa.query(state.db) } };
});
vi.mock("../../models/user.js", async () => {
	const { Model } = await import("objection");
	class User extends Model {
		static get tableName() {
			return "user";
		}
	}
	return { default: { query: () => User.query(state.db) } };
});
vi.mock("../../models/user-2fa-backup-codes.js", () => ({ default: {} }));
vi.mock("../../models/token.js", () => ({
	default: () => ({
		load: async (token) => {
			if (!/^pending-[12]$/.test(token)) throw new Error("Invalid signature");
			return { attrs: { id: Number(token.at(-1)) }, scope: ["2fa_pending"], exp: state.pendingExpires };
		},
	}),
}));
vi.mock("@duosecurity/duo_universal", () => ({
	Client: class {
		createAuthUrl(_username, loginState) {
			return `https://duo.example.test/authorize?state=${loginState}`;
		}
		exchangeAuthorizationCodeFor2FAResult(code, username) {
			return state.exchange(code, username);
		}
	},
}));
vi.mock("../../internal/token.js", () => ({ default: { issueTokenPair: state.issuePair } }));
vi.mock("../../lib/express/jwt.js", () => ({ default: () => (_req, _res, next) => next() }));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => (_req, _res, next) => next() }));
vi.mock("../../lib/express/demo.js", () => ({ default: (_req, _res, next) => next() }));
vi.mock("../../lib/validator/api.js", () => ({ default: vi.fn() }));
vi.mock("../../schema/index.js", () => ({ getCompiledSchema: async () => ({}), getValidationSchema: vi.fn() }));
vi.mock("../../setup.js", () => ({ isSetup: async () => true }));
vi.mock("../../logger.js", () => ({
	debug: vi.fn(),
	express: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("express-rate-limit", () => ({ default: () => (_req, _res, next) => next() }));
vi.mock("../../routes/main.js", async () => {
	const { default: express } = await import("express");
	const { default: tokens } = await import("../../routes/tokens.js");
	const router = express.Router();
	router.get("/api/", (_req, res) => res.json({ csrfToken: res.locals.csrfToken }));
	router.use("/api/tokens", tokens);
	return { default: router };
});

import app from "../../app.js";

let server;
let origin;
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const duoCookie = (response) =>
	response.headers.getSetCookie().findLast((cookie) => cookie.startsWith("shieldpm_duo="));
const expectCleared = (response) => {
	expect(duoCookie(response)).toContain("shieldpm_duo=;");
	expect(duoCookie(response)).toContain("Expires=Thu, 01 Jan 1970");
	expect(duoCookie(response)).toContain("Path=/api/tokens/2fa/duo;");
};

const browser = () => {
	const jar = new Map();
	let csrf;
	const cookies = () => [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
	const request = async (path, { body, cookie = cookies(), xsrf = csrf, headers = {} } = {}) => {
		const response = await fetch(`${origin}${path}`, {
			method: body === undefined ? "GET" : "POST",
			headers: {
				"user-agent": "Duo integration browser",
				cookie,
				...(body === undefined ? {} : { "content-type": "application/json" }),
				...(xsrf ? { "x-xsrf-token": xsrf } : {}),
				...headers,
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
		for (const item of response.headers.getSetCookie()) {
			const [pair] = item.split(";");
			const equals = pair.indexOf("=");
			const key = pair.slice(0, equals);
			const value = pair.slice(equals + 1);
			if (value) jar.set(key, value);
			else jar.delete(key);
		}
		return response;
	};
	return {
		jar,
		cookies,
		request,
		async health() {
			const response = await request("/api/");
			csrf = (await response.json()).csrfToken;
			expect(csrf).toEqual(expect.any(String));
		},
		async begin(userId = 1, options = {}) {
			const response = await request("/api/tokens/2fa/duo/begin", {
				body: { pending_token: `pending-${userId}` },
				...options,
			});
			const body = await response.json();
			expect(response.status).toBe(200);
			expect(Object.keys(body)).toEqual(["auth_url"]);
			return {
				response,
				state: new URL(body.auth_url).searchParams.get("state"),
				binding: jar.get("shieldpm_duo"),
			};
		},
		complete(loginState, options = {}) {
			return request("/api/tokens/2fa/duo/complete", {
				body: { duo_code: "provider-code", state: loginState },
				...options,
			});
		},
	};
};

beforeAll(async () => {
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	await state.db.schema.createTable("user", (table) => {
		table.increments("id");
		table.string("email");
		table.integer("is_deleted").defaultTo(0);
		table.integer("is_disabled").defaultTo(0);
	});
	await state.db.schema.createTable("user_2fa", (table) => {
		table.increments("id");
		table.integer("user_id");
		table.string("type");
		table.string("secret");
		table.text("meta");
		table.integer("is_verified").defaultTo(0);
		table.integer("is_deleted").defaultTo(0);
	});
	server = app.listen(0, "127.0.0.1");
	await new Promise((resolve) => server.once("listening", resolve));
	origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
	await new Promise((resolve) => server.close(resolve));
	await state.db.destroy();
});

beforeEach(async () => {
	vi.clearAllMocks();
	state.pendingExpires = Math.floor(Date.now() / 1000) + 300;
	state.exchange.mockReset().mockResolvedValue({ auth_result: { result: "allow", status: "allow" } });
	state.issuePair.mockResolvedValue({
		access_token: "access-token",
		access_expires: new Date(Date.now() + 60000).toISOString(),
		refresh_token: "refresh-token",
		refresh_expires: new Date(Date.now() + 3600000).toISOString(),
		user: { id: 1 },
	});
	await state.db("user_2fa").delete();
	await state.db("user").delete();
	await state.db("user").insert([
		{ id: 1, email: "one@example.test" },
		{ id: 2, email: "two@example.test" },
	]);
	await state.db("user_2fa").insert([1, 2].map((id) => ({ user_id: id, type: "duo", is_verified: 1, meta: "{}" })));
});

describe("Duo browser-bound redirect API", () => {
	it("returns only the provider URL and sets a private, expiring, host-only cookie", async () => {
		const client = browser();
		await client.health();
		state.pendingExpires = Math.floor(Date.now() / 1000) + 30;
		const login = await client.begin(1, { headers: { "x-forwarded-proto": "https" } });
		const cookie = duoCookie(login.response);
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("SameSite=Lax");
		expect(cookie).toContain("Secure");
		expect(cookie).toContain("Path=/api/tokens/2fa/duo;");
		expect(cookie).not.toContain("Domain=");
		expect(Number(cookie.match(/Max-Age=(\d+)/)[1])).toBeGreaterThan(0);
		expect(Number(cookie.match(/Max-Age=(\d+)/)[1])).toBeLessThanOrEqual(30);
		expect(login.response.headers.get("cache-control")).toBe("no-store");
		const challenge = await state.db("user_2fa").where({ type: "duo_auth_challenge" }).first();
		expect(challenge.secret).toBe(hash(login.binding));
		expect(JSON.parse(challenge.meta)).toEqual({
			challenge: hash(login.state),
			expiresAt: state.pendingExpires * 1000,
		});
		expect(login.binding).not.toBe(login.state);
	});

	it.each(["begin", "complete"])("requires valid CSRF protection for Duo %s", async (endpoint) => {
		const client = browser();
		await client.health();
		const login = await client.begin();
		const response = await client.request(`/api/tokens/2fa/duo/${endpoint}`, {
			body: { pending_token: "pending-1", duo_code: "code", state: login.state },
			xsrf: null,
		});
		expect(response.status).toBe(403);
		expect(state.exchange).not.toHaveBeenCalled();
		expect(state.issuePair).not.toHaveBeenCalled();
		// A cross-site request must not cancel an in-progress browser login.
		expect(duoCookie(response)).toBeUndefined();
		expect(await state.db("user_2fa").where({ type: "duo_auth_challenge" })).toHaveLength(1);
	});

	it("rejects another anonymous browser's CSRF token even with a matching cookie", async () => {
		const client = browser();
		await client.health();
		const login = await client.begin();
		const response = await client.complete(login.state, { headers: { "user-agent": "Different browser" } });
		expect(response.status).toBe(403);
		expect(state.exchange).not.toHaveBeenCalled();
	});

	it("rejects a missing cookie even if the pending JWT and binding are supplied in JSON", async () => {
		const client = browser();
		await client.health();
		const login = await client.begin();
		client.jar.delete("shieldpm_duo");
		const response = await client.complete(login.state, {
			body: { pending_token: "pending-1", browserToken: login.binding, duo_code: "code", state: login.state },
		});
		expect(response.status).toBe(401);
		expectCleared(response);
		expect(state.exchange).not.toHaveBeenCalled();
	});

	it.each(["wrong cookie", "wrong state", "missing state", "expired challenge"])(
		"rejects %s and clears the cookie",
		async (reason) => {
			const client = browser();
			await client.health();
			const login = await client.begin();
			if (reason === "wrong cookie") client.jar.set("shieldpm_duo", "x".repeat(43));
			if (reason === "expired challenge") {
				await state
					.db("user_2fa")
					.where({ type: "duo_auth_challenge" })
					.update({ meta: JSON.stringify({ challenge: hash(login.state), expiresAt: Date.now() - 1 }) });
			}
			const callbackState =
				reason === "wrong state" ? "wrong-state" : reason === "missing state" ? undefined : login.state;
			const response = await client.complete(callbackState);
			expect(response.status).toBe(400);
			expectCleared(response);
			expect(state.exchange).not.toHaveBeenCalled();
			expect(state.issuePair).not.toHaveBeenCalled();
		},
	);

	it("rejects one user's state paired with another user's browser cookie", async () => {
		const first = browser();
		const second = browser();
		await first.health();
		await second.health();
		const firstLogin = await first.begin(1);
		await second.begin(2);
		const response = await second.complete(firstLogin.state);
		expect(response.status).toBe(400);
		expect(state.exchange).not.toHaveBeenCalled();
	});

	it("resolves identity from the cookie binding and consumes it before issuing a session", async () => {
		const client = browser();
		await client.health();
		const login = await client.begin();
		const originalCookies = client.cookies();
		state.exchange.mockImplementationOnce(async (_code, username) => {
			expect(username).toBe("one@example.test");
			expect(await state.db("user_2fa").where({ type: "duo_auth_challenge" })).toHaveLength(0);
			return { auth_result: { result: "allow", status: "allow" } };
		});
		const response = await client.complete(login.state, {
			body: { duo_code: "provider-code", state: login.state, pending_token: "pending-2", user_id: 2 },
		});
		expect(response.status).toBe(200);
		expectCleared(response);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(state.issuePair).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "user", expect.any(Object));
		expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith("shieldpm_jwt=access-token;"))).toBe(
			true,
		);
		const replay = await client.complete(login.state, { cookie: originalCookies });
		expect(replay.status).toBe(400);
		expectCleared(replay);
		expect(state.exchange).toHaveBeenCalledTimes(1);
		expect(state.issuePair).toHaveBeenCalledTimes(1);
	});

	it("atomically permits only one provider exchange for concurrent callbacks", async () => {
		const client = browser();
		await client.health();
		const login = await client.begin();
		const originalCookies = client.cookies();
		const responses = await Promise.all([
			client.complete(login.state, { cookie: originalCookies }),
			client.complete(login.state, { cookie: originalCookies }),
		]);
		expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
		for (const response of responses) expectCleared(response);
		expect(state.exchange).toHaveBeenCalledTimes(1);
		expect(state.issuePair).toHaveBeenCalledTimes(1);
	});

	it.each(["denied", "malformed", "provider failure"])(
		"does not issue or replay a session after %s",
		async (reason) => {
			const client = browser();
			await client.health();
			const login = await client.begin();
			const originalCookies = client.cookies();
			if (reason === "provider failure")
				state.exchange.mockRejectedValueOnce(new Error("Private provider error"));
			else
				state.exchange.mockResolvedValueOnce(
					reason === "denied" ? { auth_result: { result: "deny", status: "deny" } } : {},
				);
			const response = await client.complete(login.state);
			expect(response.status).toBe(reason === "provider failure" ? 500 : 401);
			expectCleared(response);
			expect(await response.text()).not.toContain("Private provider error");
			const replay = await client.complete(login.state, { cookie: originalCookies });
			expect(replay.status).toBe(400);
			expect(state.exchange).toHaveBeenCalledTimes(1);
			expect(state.issuePair).not.toHaveBeenCalled();
		},
	);

	it.each(["before", "during"])("rejects a user disabled %s provider verification", async (when) => {
		const client = browser();
		await client.health();
		const login = await client.begin();
		if (when === "before") await state.db("user").where({ id: 1 }).update({ is_disabled: 1 });
		else
			state.exchange.mockImplementationOnce(async () => {
				await state.db("user").where({ id: 1 }).update({ is_disabled: 1 });
				return { auth_result: { result: "allow", status: "allow" } };
			});
		const response = await client.complete(login.state);
		expect(response.status).toBe(when === "before" ? 400 : 401);
		expectCleared(response);
		expect(state.issuePair).not.toHaveBeenCalled();
	});

	it.each(["invalid", "expired"])("clears a stale cookie when begin receives an %s pending token", async (reason) => {
		const client = browser();
		await client.health();
		await client.begin();
		if (reason === "expired") state.pendingExpires = Math.floor(Date.now() / 1000) - 1;
		const response = await client.request("/api/tokens/2fa/duo/begin", {
			body: { pending_token: reason === "invalid" ? "invalid-token" : "pending-1" },
		});
		expect(response.status).toBe(reason === "invalid" ? 401 : 400);
		expectCleared(response);
	});
});
