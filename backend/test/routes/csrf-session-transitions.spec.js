import crypto from "node:crypto";
import Ajv from "ajv";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	db: null,
	keys: null,
	twoFa: false,
	healthBlock: null,
	healthStarted: null,
	writes: 0,
}));
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
vi.mock("../../setup.js", () => ({ isSetup: async () => true }));
// Factor verification has separate cryptographic/SQLite integration suites.
// This suite exercises the real HTTP transition after a successful factor.
vi.mock("../../internal/2fa-service.js", () => ({
	default: {
		verifyLoginChallenge: async () => true,
		completePasskeyAuthentication: async () => true,
		completeDuoAuthentication: async () => ({ id: 2, email: "user@example.test", roles: [] }),
	},
}));
vi.mock("../../models/user-2fa.js", () => ({
	default: {
		hasActive2FA: async () => state.twoFa,
		getActiveForUser: async () => [{ type: "totp" }],
	},
}));
vi.mock("../../routes/main.js", async () => {
	const { default: express } = await import("express");
	const { default: tokens } = await import("../../routes/tokens.js");
	const { default: users } = await import("../../routes/users.js");
	const { default: oidc } = await import("../../routes/oidc.js");
	const { default: decode } = await import("../../lib/express/jwt-decode.js");
	const router = express.Router();
	router.get("/api/", async (_req, res) => {
		state.healthStarted?.resolve();
		if (state.healthBlock) await state.healthBlock.promise;
		res.json({ csrfToken: res.locals.csrfToken });
	});
	router.post("/api/protected", decode(), async (_req, res) => {
		state.writes++;
		const access = res.locals.access;
		await access.can("users:get", access.token.getUserId());
		res.json({ userId: access.token.getUserId() });
	});
	router.post("/api/denied", (_req, _res, next) => {
		const error = new Error("Denied");
		error.status = 403;
		error.code = "EBADCSRFTOKEN";
		next(error);
	});
	router.post("/api/anonymous-action", (_req, res) => res.sendStatus(204));
	router.use("/api/tokens", tokens);
	router.use("/api/users", users);
	router.use("/api/oidc", oidc);
	return { default: router };
});

import app from "../../app.js";
import sessions from "../../internal/auth-session-service.js";
import internalToken from "../../internal/token.js";
import { encrypt } from "../../lib/encryption.js";
import errs from "../../lib/error.js";
import { up as initialSchema } from "../../migrations/20180618015850_initial.js";
import { up as settingSchema } from "../../migrations/20190227065017_settings.js";
import { up as sessionSchema } from "../../migrations/20260316122700_add_auth_sessions.js";
import Token from "../../models/token.js";
import User from "../../models/user.js";
import errorContract from "../../schema/components/error-object.json" with { type: "json" };
import { getCompiledSchema } from "../../schema/index.js";

let server;
let origin;
let schema;
const ajv = new Ajv({ strict: false, validateFormats: false });
const browser = () => {
	const jar = new Map();
	let csrf;
	return {
		jar,
		get csrf() {
			return csrf;
		},
		async request(path, method = "GET", body = undefined, acceptCsrf = true) {
			const response = await fetch(`${origin}/api${path}`, {
				method,
				headers: {
					Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
					"User-Agent": "Session transition browser",
					...(csrf ? { "X-XSRF-TOKEN": csrf } : {}),
					...(body ? { "Content-Type": "application/json" } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			});
			for (const item of response.headers.getSetCookie()) {
				const pair = item.split(";", 1)[0];
				const separator = pair.indexOf("=");
				const name = pair.slice(0, separator);
				const value = pair.slice(separator + 1);
				if (value) jar.set(name, value);
				else jar.delete(name);
			}
			const data = response.headers.get("content-type")?.includes("application/json")
				? await response.json()
				: null;
			if (acceptCsrf) csrf = data?.csrfToken || response.headers.get("x-xsrf-token") || csrf;
			return { response, data };
		},
	};
};
const signed = async (id, scope = "user") =>
	(await Token().create({ attrs: { id }, scope: [scope], expiresIn: "5m" })).token;
const assertProtected = async (client, id) => {
	const result = await client.request("/protected", "POST", {});
	expect(result.response.status, JSON.stringify(result.data)).toBe(200);
	expect(result.data).toEqual({ userId: id });
};

beforeAll(async () => {
	schema = await getCompiledSchema();
	state.keys = crypto.generateKeyPairSync("rsa", {
		modulusLength: 2048,
		privateKeyEncoding: { type: "pkcs8", format: "pem" },
		publicKeyEncoding: { type: "spki", format: "pem" },
	});
	await initialSchema(state.db);
	await settingSchema(state.db);
	await sessionSchema(state.db);
	const timestamp = "2026-09-08 12:00:00";
	for (const [id, email, roles] of [
		[1, "admin@example.test", ["admin"]],
		[2, "user@example.test", []],
	]) {
		await state.db("user").insert({
			id,
			email,
			roles: JSON.stringify(roles),
			name: "Test User",
			nickname: "test",
			avatar: "",
			created_on: timestamp,
			modified_on: timestamp,
		});
		await state.db("user_permission").insert({
			user_id: id,
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
			user_id: id,
			type: "password",
			secret: await bcrypt.hash("test-password", 4),
			meta: "{}",
			created_on: timestamp,
			modified_on: timestamp,
		});
	}
	await state
		.db("setting")
		.insert({ id: "oidc-config", name: "OIDC", description: "Test", value: "", meta: '{"enabled":true}' });
	server = app.listen(0, "127.0.0.1");
	await new Promise((resolve) => server.once("listening", resolve));
	origin = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
	state.twoFa = false;
	state.writes = 0;
	await state.db("auth_sessions").delete();
});
afterAll(async () => {
	server?.closeAllConnections();
	if (server) await new Promise((resolve) => server.close(resolve));
	await state.db.destroy();
});

describe("CSRF follows the response's session cookies without an extra health request", () => {
	it("recovers an anonymous health response arriving after startup refresh without repeating a write", async () => {
		const pair = await sessions.issueTokenPair(await User.query().findById(2));
		const client = browser();
		client.jar.set("shieldpm_refresh", pair.refresh_token);
		state.healthBlock = Promise.withResolvers();
		state.healthStarted = Promise.withResolvers();
		// The frontend rejects this response's body after its session revision changes;
		// browser cookie updates still occur regardless of that JavaScript guard.
		const pendingHealth = client.request("/", "GET", undefined, false);
		await state.healthStarted.promise;
		try {
			expect((await client.request("/tokens/refresh", "POST", {})).response.status).toBe(200);
			const refreshedCsrf = client.csrf;
			state.healthBlock.resolve();
			await pendingHealth;
			expect(client.csrf).toBe(refreshedCsrf);
			expect(client.jar.get("XSRF-TOKEN")).not.toBe(client.csrf);
			const rejected = await client.request("/protected", "POST", {});
			expect(rejected.response.status).toBe(403);
			expect(rejected.data.error).toMatchObject({ code: 403, reason: "EBADCSRFTOKEN" });
			const validate = ajv.compile(errorContract);
			expect(validate(rejected.data.error), JSON.stringify(validate.errors)).toBe(true);
			expect(state.writes).toBe(0);
			await client.request("/");
			await assertProtected(client, 2);
			expect(state.writes).toBe(1);
		} finally {
			state.healthBlock.resolve();
			await pendingHealth;
			state.healthBlock = null;
			state.healthStarted = null;
		}
	});
	it("does not mark an ordinary route's 403 as safely retryable even with the same error code", async () => {
		const client = browser();
		await client.request("/");
		const denied = await client.request("/denied", "POST", {});
		expect(denied.response.status).toBe(403);
		expect(denied.data.error).not.toHaveProperty("reason");
	});
	it("does not overwrite a new login's CSRF cookie when an older refresh fails late", async () => {
		const client = browser();
		await client.request("/");
		client.jar.set("shieldpm_refresh", "old-refresh");
		const started = Promise.withResolvers();
		const delayed = Promise.withResolvers();
		const refresh = vi.spyOn(internalToken, "refreshTokenPair").mockImplementationOnce(() => {
			started.resolve();
			return delayed.promise;
		});
		const pending = client.request("/tokens/refresh", "POST", {});
		await started.promise;
		try {
			expect(
				(await client.request("/tokens", "POST", { identity: "user@example.test", secret: "test-password" }))
					.response.status,
			).toBe(200);
			delayed.reject(new errs.AuthError("Old refresh expired"));
			const failure = await pending;
			expect(failure.response.status).toBe(401);
			expect(failure.response.headers.getSetCookie()).toEqual([]);
			await assertProtected(client, 2);
		} finally {
			delayed.reject(new errs.AuthError("Old refresh expired"));
			await pending;
			refresh.mockRestore();
		}
	});
	it("supports an immediate authenticated write after password login", async () => {
		const client = browser();
		await client.request("/");
		const login = await client.request("/tokens", "POST", {
			identity: "user@example.test",
			secret: "test-password",
		});
		expect(login.response.status).toBe(200);
		await assertProtected(client, 2);
	});
	it.each([false, true])("refreshes with an existing access cookie=%s", async (hasAccess) => {
		const pair = await sessions.issueTokenPair(await User.query().findById(2));
		const client = browser();
		client.jar.set("shieldpm_refresh", pair.refresh_token);
		if (hasAccess) client.jar.set("shieldpm_jwt", pair.access_token);
		await client.request("/");
		const oldCsrf = client.csrf;
		expect((await client.request("/tokens/refresh", "POST", {})).response.status).toBe(200);
		if (hasAccess) expect(client.csrf).toBe(oldCsrf);
		await assertProtected(client, 2);
	});
	it.each(["totp", "yubikey", "backup_code", "passkey", "duo"])(
		"supports a write immediately after %s verification",
		async (method) => {
			const client = browser();
			await client.request("/");
			const pending_token = await signed(2, "2fa_pending");
			let path = "/tokens/2fa/verify";
			let body = { pending_token, method, code: "factor-success" };
			if (method === "passkey") {
				path = "/tokens/2fa/passkey/complete";
				body = { pending_token, challenge_id: "challenge", auth_response: {} };
			}
			if (method === "duo") {
				path = "/tokens/2fa/duo/complete";
				body = { duo_code: "code", state: "state" };
				client.jar.set(
					"shieldpm_duo",
					encodeURIComponent(
						encrypt(
							JSON.stringify({
								purpose: "shieldpm:duo-cookie:v1",
								browserToken: "a".repeat(43),
								expiresAt: Date.now() + 60000,
							}),
						),
					),
				);
			}
			expect((await client.request(path, "POST", body)).response.status).toBe(200);
			await assertProtected(client, 2);
		},
	);
	it("supports a write immediately after claiming the OIDC handoff", async () => {
		const client = browser();
		await client.request("/");
		client.jar.set(
			"shieldpm_oidc",
			encodeURIComponent(encrypt(`${await signed(2)}---${new Date(Date.now() + 60000).toISOString()}`)),
		);
		expect((await client.request("/oidc/claim", "POST", {})).response.status).toBe(200);
		await assertProtected(client, 2);
	});
	it("switches CSRF to the impersonated user and back to the original administrator", async () => {
		const client = browser();
		client.jar.set("shieldpm_jwt", await signed(1));
		await client.request("/");
		const impersonated = await client.request("/users/2/login", "POST", {});
		expect(impersonated.response.status).toBe(200);
		expect(impersonated.data.csrfToken).toBe(client.csrf);
		const validate = ajv.compile(
			schema.paths["/users/{userID}/login"].post.responses[200].content["application/json"].schema,
		);
		expect(validate(impersonated.data), JSON.stringify(validate.errors)).toBe(true);
		await assertProtected(client, 2);
		expect((await client.request("/tokens/restore", "POST", {})).response.status).toBe(200);
		await assertProtected(client, 1);
	});
	it.each([
		["/tokens/logout", "POST"],
		["/tokens", "DELETE"],
	])("returns anonymous CSRF after %s %s", async (path, method) => {
		const client = browser();
		client.jar.set("shieldpm_jwt", await signed(2));
		await client.request("/");
		expect((await client.request(path, method, {})).response.status).toBe(204);
		expect(client.jar.has("shieldpm_jwt")).toBe(false);
		expect((await client.request("/anonymous-action", "POST", {})).response.status).toBe(204);
	});
});
