import crypto from "node:crypto";
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
vi.mock("../../lib/express/demo.js", () => ({ default: (_req, _res, next) => next() }));
vi.mock("../../setup.js", () => ({ isSetup: async () => true }));
vi.mock("../../routes/main.js", async () => {
	const { default: express } = await import("express");
	const { default: sessions } = await import("../../routes/sessions.js");
	const router = express.Router();
	router.use("/api/tokens/sessions", sessions);
	return { default: router };
});

import app from "../../app.js";
import pairs from "../../internal/auth-session-service.js";
import { up as initialSchema } from "../../migrations/20180618015850_initial.js";
import { up as sessionSchema } from "../../migrations/20260316122700_add_auth_sessions.js";
import User from "../../models/user.js";

let server;
let origin;
let current;
let other;
let foreign;
let cookies;

const request = async (suffix = "", options = {}) => {
	const response = await fetch(`${origin}/api/tokens/sessions${suffix}`, {
		...options,
		headers: { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "), ...options.headers },
	});
	for (const header of response.headers.getSetCookie()) {
		const pair = header.split(";", 1)[0];
		const index = pair.indexOf("=");
		cookies.set(pair.slice(0, index), pair.slice(index + 1));
	}
	return response;
};
const csrf = () => ({ "X-XSRF-TOKEN": decodeURIComponent(cookies.get("XSRF-TOKEN")) });

describe("browser session management through real auth, cookies and CSRF middleware", () => {
	beforeAll(async () => {
		state.keys = crypto.generateKeyPairSync("rsa", {
			modulusLength: 2048,
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});
		await initialSchema(state.db);
		await sessionSchema(state.db);
		await User.query().insert({
			id: 7,
			email: "owner@example.test",
			name: "Owner",
			nickname: "owner",
			avatar: "",
			roles: [],
		});
		await User.query().insert({
			id: 8,
			email: "foreign@example.test",
			name: "Foreign",
			nickname: "foreign",
			avatar: "",
			roles: [],
		});
		await state.db("user_permission").insert(
			[7, 8].map((userId) => ({
				user_id: userId,
				created_on: state.db.fn.now(),
				modified_on: state.db.fn.now(),
				visibility: "user",
				proxy_hosts: "manage",
				redirection_hosts: "manage",
				dead_hosts: "manage",
				streams: "manage",
				access_lists: "manage",
				certificates: "manage",
			})),
		);
		server = app.listen(0, "127.0.0.1");
		await new Promise((resolve) => server.once("listening", resolve));
		origin = `http://127.0.0.1:${server.address().port}`;
	});
	beforeEach(async () => {
		await state.db("auth_sessions").delete();
		await state.db("user").update({ is_disabled: 0 });
		const owner = await User.query().findById(7);
		current = await pairs.issueTokenPair(owner, "user", { ip: "192.0.2.1", userAgent: "Current browser" });
		other = await pairs.issueTokenPair(owner, "user", { ip: "192.0.2.2", userAgent: "Other browser" });
		foreign = await pairs.issueTokenPair(await User.query().findById(8), "user", { userAgent: "Foreign browser" });
		cookies = new Map([
			["shieldpm_jwt", current.access_token],
			["shieldpm_refresh", current.refresh_token],
		]);
	});
	afterAll(async () => {
		if (server) await new Promise((resolve) => server.close(resolve));
		await state.db.destroy();
	});

	it("groups rotations as one device, marks this browser, and exposes no credentials or foreign devices", async () => {
		const rotated = await pairs.refreshTokenPair(current.refresh_token, { userAgent: "Current refreshed browser" });
		cookies.set("shieldpm_jwt", rotated.access_token);
		const response = await request();
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.sessions).toHaveLength(2);
		expect(body.sessions.filter((session) => session.current)).toHaveLength(1);
		expect(body.sessions.find((session) => session.current).family_id).toBe(current.session.family_id);
		expect(JSON.stringify(body)).not.toMatch(
			/token_hash|refresh_token|parent_session_id|replaced_by_session_id|jti|Foreign browser/,
		);
		expect(JSON.stringify(body)).not.toContain(current.refresh_token);
	});

	it("requires CSRF for revocation and revokes an entire selected family", async () => {
		const rotatedOther = await pairs.refreshTokenPair(other.refresh_token);
		await request();
		expect((await request(`/${other.session.family_id}`, { method: "DELETE" })).status).toBe(403);
		await expect(pairs.refreshTokenPair(rotatedOther.refresh_token)).resolves.toHaveProperty("access_token");
		const response = await request(`/${other.session.family_id}`, { method: "DELETE", headers: csrf() });
		expect(response.status).toBe(200);
		await expect(pairs.refreshTokenPair(other.refresh_token)).rejects.toThrow("revoked");
		await expect(pairs.refreshTokenPair(current.refresh_token)).resolves.toHaveProperty("access_token");
		await expect(pairs.refreshTokenPair(foreign.refresh_token)).resolves.toHaveProperty("access_token");
	});

	it("revokes all other own devices while preserving this family and another user's devices", async () => {
		await request();
		expect((await request("/others", { method: "DELETE", headers: csrf() })).status).toBe(200);
		await expect(pairs.refreshTokenPair(other.refresh_token)).rejects.toThrow("revoked");
		await expect(pairs.refreshTokenPair(current.refresh_token)).resolves.toHaveProperty("access_token");
		await expect(pairs.refreshTokenPair(foreign.refresh_token)).resolves.toHaveProperty("access_token");
	});

	it("rejects foreign-family revocation and mismatched refresh cookies", async () => {
		await request();
		expect((await request(`/${foreign.session.family_id}`, { method: "DELETE", headers: csrf() })).status).toBe(
			404,
		);
		cookies.set("shieldpm_refresh", foreign.refresh_token);
		expect((await request()).status).toBe(400);
		await expect(pairs.refreshTokenPair(foreign.refresh_token)).resolves.toHaveProperty("access_token");
	});

	it("uses logout for the current device and requires a live browser login", async () => {
		await request();
		expect((await request(`/${current.session.family_id}`, { method: "DELETE", headers: csrf() })).status).toBe(
			400,
		);
		cookies.delete("shieldpm_refresh");
		expect((await request()).status).toBe(400);
		cookies.set("shieldpm_refresh", current.refresh_token);
		await state.db("user").where("id", 7).update({ is_disabled: 1 });
		expect((await request()).status).toBe(400);
	});
});
