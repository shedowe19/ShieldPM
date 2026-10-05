import crypto from "node:crypto";
import http from "node:http";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, keys: null }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => true,
	isDestructiveTestMode: () => false,
	getEncryptionKey: () => "01".repeat(32),
	getPrivateKey: () => state.keys.privateKey,
	getPublicKey: () => state.keys.publicKey,
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../lib/express/demo.js", () => ({ default: (_req, _res, next) => next() }));
// Use the same persisted setup-state query without importing unrelated startup jobs.
vi.mock("../../setup.js", () => ({
	isSetup: async () => Boolean(await state.db("user").select("id").where("is_deleted", 0).first()),
}));
// This boundary suite covers the password path; factor cryptography and login
// transitions have their own real-service and real-app integration suites.
vi.mock("../../models/user-2fa.js", () => ({ default: { hasActive2FA: async () => false } }));
vi.mock("../../routes/main.js", async () => {
	const { default: express } = await import("express");
	const { default: tokens } = await import("../../routes/tokens.js");
	const { default: users } = await import("../../routes/users.js");
	const router = express.Router();
	router.get("/api/", (_req, res) => res.json({ csrfToken: res.locals.csrfToken }));
	router.post("/api/other-form", (req, res) => res.json(req.body));
	for (const prefix of ["", "/api"]) {
		router.use(`${prefix}/tokens`, tokens);
		router.use(`${prefix}/users`, users);
	}
	return { default: router };
});

import app from "../../app.js";
import sessions from "../../internal/auth-session-service.js";
import { up as initialSchema } from "../../migrations/20180618015850_initial.js";
import { up as settingSchema } from "../../migrations/20190227065017_settings.js";
import { up as sessionSchema } from "../../migrations/20260316122700_add_auth_sessions.js";
import Token from "../../models/token.js";
import User from "../../models/user.js";

let server;
let origin;
const credentials = { identity: "user@example.test", secret: "test-password" };
const formTypes = [
	"application/x-www-form-urlencoded; charset=UTF-8",
	"multipart/form-data; boundary=auth-boundary",
	"text/plain; charset=UTF-8",
];
const formBody = (contentType, fields) => {
	if (contentType.startsWith("multipart/")) {
		return `${Object.entries(fields)
			.map(
				([name, value]) =>
					`--auth-boundary\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
			)
			.join("")}--auth-boundary--\r\n`;
	}
	if (contentType.startsWith("text/plain")) {
		return Object.entries(fields)
			.map(([name, value]) => `${name}=${value}\r\n`)
			.join("");
	}
	return new URLSearchParams(fields).toString();
};
const jsonPost = (path, body, headers = {}) =>
	fetch(`${origin}${path}`, {
		method: "POST",
		headers: { "Content-Type": "Application/JSON; Charset=UTF-8", "X-Forwarded-For": "198.51.100.77", ...headers },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
// Native HTTP keeps Content-Type genuinely absent even when a body is supplied.
const nativePost = (path, headers = {}, body = undefined) =>
	new Promise((resolve, reject) => {
		const request = http.request(`${origin}${path}`, { method: "POST", headers }, (response) => {
			let text = "";
			response.setEncoding("utf8");
			response.on("data", (chunk) => {
				text += chunk;
			});
			response.on("end", () =>
				resolve({
					status: response.statusCode,
					cookies: response.headers["set-cookie"] || [],
					data: text ? JSON.parse(text) : null,
				}),
			);
		});
		request.on("error", reject);
		request.end(body);
	});
const expectNoCookies = (response) => {
	expect(response.status).toBe(415);
	expect(response.headers.getSetCookie()).toEqual([]);
	expect(response.headers.get("x-xsrf-token")).toBeNull();
};

beforeAll(async () => {
	state.keys = crypto.generateKeyPairSync("rsa", {
		modulusLength: 2048,
		privateKeyEncoding: { type: "pkcs8", format: "pem" },
		publicKeyEncoding: { type: "spki", format: "pem" },
	});
	await initialSchema(state.db);
	await settingSchema(state.db);
	await sessionSchema(state.db);
	await state.db.schema.alterTable("user_permission", (table) => {
		table.string("cloudflared_tunnels");
		table.string("analytics");
	});
	await state
		.db("setting")
		.insert({ id: "default-site", name: "Default site", description: "Test", value: "404", meta: "{}" });
	server = app.listen(0, "127.0.0.1");
	await new Promise((resolve) => server.once("listening", resolve));
	origin = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
	for (const table of ["auth_sessions", "auth", "user_permission", "user"]) await state.db(table).delete();
	const timestamp = "2026-10-04 12:00:00";
	await state.db("user").insert({
		id: 2,
		email: credentials.identity,
		name: "Test User",
		nickname: "test",
		avatar: "",
		roles: "[]",
		created_on: timestamp,
		modified_on: timestamp,
	});
	await state.db("user_permission").insert({
		user_id: 2,
		visibility: "user",
		proxy_hosts: "manage",
		redirection_hosts: "manage",
		dead_hosts: "manage",
		streams: "manage",
		access_lists: "manage",
		certificates: "manage",
		created_on: timestamp,
		modified_on: timestamp,
	});
	await state.db("auth").insert({
		user_id: 2,
		type: "password",
		secret: await bcrypt.hash(credentials.secret, 4),
		meta: "{}",
		created_on: timestamp,
		modified_on: timestamp,
	});
});
afterAll(async () => {
	server?.closeAllConnections();
	if (server) await new Promise((resolve) => server.close(resolve));
	await state.db.destroy();
});

describe.each(["", "/api"])("authentication Content-Type boundary at %s", (prefix) => {
	it.each(formTypes)("rejects login forms with %s before cookies or session creation", async (contentType) => {
		const response = await fetch(`${origin}${prefix}/tokens`, {
			method: "POST",
			headers: {
				"Content-Type": contentType,
				Origin: "https://attacker.example.test",
				"Sec-Fetch-Site": "cross-site",
				"Sec-Fetch-Mode": "navigate",
				"Sec-Fetch-Dest": "document",
			},
			body: formBody(contentType, credentials),
		});
		expectNoCookies(response);
		expect(await response.json()).toEqual({ error: { code: 415, message: "Unsupported content type" } });
		expect(await state.db("auth_sessions")).toHaveLength(0);
	});

	it.each(formTypes)("rejects refresh forms with %s without consuming a valid refresh token", async (contentType) => {
		const pair = await sessions.issueTokenPair(await User.query().findById(2));
		const response = await fetch(`${origin}${prefix}/tokens/refresh`, {
			method: "POST",
			headers: {
				"Content-Type": contentType,
				Cookie: `shieldpm_refresh=${pair.refresh_token}`,
				Origin: "https://attacker.example.test",
				"Sec-Fetch-Site": "cross-site",
				"Sec-Fetch-Mode": "navigate",
			},
			body: formBody(contentType, { refresh_token: pair.refresh_token }),
		});
		expectNoCookies(response);
		expect(await state.db("auth_sessions")).toHaveLength(1);
		const active = await state.db("auth_sessions").first();
		expect(active.revoked_at).toBeNull();
		await expect(sessions.refreshTokenPair(pair.refresh_token)).resolves.toMatchObject({ user: { id: 2 } });
	});

	it.each(formTypes)(
		"rejects initial-setup forms with %s before CSRF cookies or account writes",
		async (contentType) => {
			await state.db("user").delete();
			const response = await fetch(`${origin}${prefix}/users`, {
				method: "POST",
				headers: { "Content-Type": contentType },
				body: formBody(contentType, { name: "Admin", nickname: "admin", email: "admin@example.test" }),
			});
			expectNoCookies(response);
			expect(await state.db("user")).toHaveLength(0);
		},
	);

	it.each([
		"/logout",
		"/restore",
		"/2fa/verify",
		"/2fa/passkey/begin",
		"/2fa/passkey/complete",
		"/2fa/duo/begin",
		"/2fa/duo/complete",
	])("rejects a simple form at tokens%s before route cookie changes", async (suffix) => {
		const response = await fetch(`${origin}${prefix}/tokens${suffix}`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "code=test-code",
		});
		expectNoCookies(response);
		expect(await state.db("auth_sessions")).toHaveLength(0);
	});

	it("preserves JSON;charset password login and issues a verified RSA token", async () => {
		const response = await jsonPost(`${prefix}/tokens`, credentials);
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.user.id).toBe(2);
		expect((await Token().load(data.token)).attrs.id).toBe(2);
		expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith("shieldpm_refresh="))).toBe(true);
	});

	it("preserves JSON refresh-token body fallback without browser cookies", async () => {
		const pair = await sessions.issueTokenPair(await User.query().findById(2));
		const response = await jsonPost(`${prefix}/tokens/refresh`, { refresh_token: pair.refresh_token });
		expect(response.status).toBe(200);
		expect((await response.json()).user.id).toBe(2);
	});

	it("preserves native bodyless cookie refresh without Content-Type", async () => {
		const pair = await sessions.issueTokenPair(await User.query().findById(2));
		const response = await nativePost(`${prefix}/tokens/refresh`, {
			Cookie: `shieldpm_refresh=${pair.refresh_token}`,
			"X-Forwarded-For": "198.51.100.78",
			"Content-Length": "0",
		});
		expect(response.status).toBe(200);
		expect(response.data.user.id).toBe(2);
		expect(response.cookies.some((cookie) => cookie.startsWith("shieldpm_refresh="))).toBe(true);
	});

	it("keeps a failed native empty refresh free of CSRF or authentication cookies", async () => {
		const response = await nativePost(`${prefix}/tokens/refresh`, {
			"X-Forwarded-For": "198.51.100.78",
			"Content-Length": "0",
		});
		expect(response.status).toBe(400);
		expect(response.cookies).toEqual([]);
	});

	it.each(["content-length", "transfer-encoding"])(
		"rejects headerless Content-Type with a %s body before rotation",
		async (framing) => {
			const pair = await sessions.issueTokenPair(await User.query().findById(2));
			const response = await nativePost(
				`${prefix}/tokens/refresh`,
				{
					Cookie: `shieldpm_refresh=${pair.refresh_token}`,
					...(framing === "content-length" ? { "Content-Length": "2" } : { "Transfer-Encoding": "chunked" }),
				},
				"{}",
			);
			expect(response.status).toBe(415);
			expect(response.cookies).toEqual([]);
			expect((await state.db("auth_sessions").first()).revoked_at).toBeNull();
		},
	);

	it("preserves JSON bodyless logout", async () => {
		const pair = await sessions.issueTokenPair(await User.query().findById(2));
		const response = await jsonPost(`${prefix}/tokens/logout`, undefined, {
			Cookie: `shieldpm_refresh=${pair.refresh_token}`,
		});
		expect(response.status).toBe(204);
		expect((await state.db("auth_sessions").first()).revoked_reason).toBe("logout");
	});

	it("preserves native bodyless logout without Content-Type", async () => {
		const pair = await sessions.issueTokenPair(await User.query().findById(2));
		const response = await nativePost(`${prefix}/tokens/logout`, {
			Cookie: `shieldpm_refresh=${pair.refresh_token}`,
			"X-Forwarded-For": "198.51.100.78",
			"Content-Length": "0",
		});
		expect(response.status).toBe(204);
		expect((await state.db("auth_sessions").first()).revoked_reason).toBe("logout");
	});

	it("preserves native bodyless restore with its ordinary CSRF token", async () => {
		const headers = { "User-Agent": "Auth boundary native client", "X-Forwarded-For": "198.51.100.78" };
		const health = await fetch(`${origin}/api/`, { headers });
		const { csrfToken } = await health.json();
		const csrfCookie = health.headers
			.getSetCookie()
			.map((cookie) => cookie.split(";", 1)[0])
			.join("; ");
		const backup = (await Token().create({ attrs: { id: 2 }, scope: ["user"], expiresIn: "5m" })).token;
		const response = await nativePost(`${prefix}/tokens/restore`, {
			...headers,
			Cookie: `${csrfCookie}; shieldpm_jwt_original=${backup}`,
			"X-XSRF-TOKEN": csrfToken,
			"Content-Length": "0",
		});
		expect(response.status).toBe(200);
		expect(response.data.user.id).toBe(2);
	});

	it("preserves a valid JSON initial-administrator setup", async () => {
		await state.db("user").delete();
		const response = await jsonPost(`${prefix}/users`, {
			name: "Admin",
			nickname: "admin",
			email: "admin@example.test",
			auth: { type: "password", secret: "initial-password" },
		});
		expect(response.status).toBe(201);
		expect((await response.json()).roles).toContain("admin");
		expect(await state.db("user").where("is_deleted", 0)).toHaveLength(1);
	});
});

it("leaves other API form parsing and its regular CSRF check unchanged", async () => {
	const health = await fetch(`${origin}/api/`);
	const { csrfToken } = await health.json();
	const cookie = health.headers
		.getSetCookie()
		.map((value) => value.split(";", 1)[0])
		.join("; ");
	const response = await fetch(`${origin}/api/other-form`, {
		method: "POST",
		headers: { Cookie: cookie, "X-XSRF-TOKEN": csrfToken, "Content-Type": "application/x-www-form-urlencoded" },
		body: "message=preserved",
	});
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ message: "preserved" });
});
