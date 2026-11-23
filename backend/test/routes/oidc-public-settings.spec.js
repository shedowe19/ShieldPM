import crypto from "node:crypto";
import cookieParser from "cookie-parser";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, keys: null }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => true,
	getEncryptionKey: () => "01".repeat(32),
	getPrivateKey: () => state.keys.privateKey,
	getPublicKey: () => state.keys.publicKey,
}));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));

import { preserveMetaSecrets } from "../../internal/setting.js";
import jwt from "../../lib/express/jwt.js";
import Token from "../../models/token.js";
import settings from "../../routes/settings.js";

describe("public OIDC settings with stale browser authentication", () => {
	let server;
	let origin;
	const tokens = {};
	beforeAll(async () => {
		state.keys = crypto.generateKeyPairSync("rsa", {
			modulusLength: 2048,
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
			publicKeyEncoding: { type: "spki", format: "pem" },
		});
		await state.db.schema.createTable("user", (table) => {
			table.increments("id");
			table.json("roles");
			table.integer("is_disabled").defaultTo(0);
			table.integer("is_deleted").defaultTo(0);
		});
		await state.db.schema.createTable("user_permission", (table) => {
			table.increments("id");
			table.integer("user_id");
		});
		await state.db.schema.createTable("setting", (table) => {
			table.string("id").primary();
			table.string("name");
			table.string("description");
			table.string("value");
			table.json("meta");
		});
		await state.db("user").insert(
			[
				{ id: 1, roles: "[]" },
				{ id: 2, roles: "[]", is_disabled: 1 },
				{ id: 3, roles: "[]", is_deleted: 1 },
				{ id: 4, roles: '["admin"]' },
			].map((user) => ({ is_deleted: 0, is_disabled: 0, ...user })),
		);
		await state.db("user_permission").insert([1, 2, 3, 4].map((user_id) => ({ user_id })));
		await state.db("setting").insert([
			{
				id: "oidc-config",
				name: "OIDC",
				description: "OIDC configuration",
				value: "enabled",
				meta: JSON.stringify({
					name: "Company SSO",
					enabled: true,
					clientID: "test-client",
					clientSecret: "must-stay-private",
					issuerURL: "https://idp.example.test",
					redirectURL: "https://shield.example.test/api/oidc/callback",
				}),
			},
			{
				id: "ai-config",
				name: "AI",
				description: "AI configuration",
				value: "enabled",
				meta: JSON.stringify({ api_key: "must-stay-private" }),
			},
		]);
		for (const [name, id, scope, expiresIn] of [
			["user", 1, "user", "5m"],
			["disabled", 2, "user", "5m"],
			["deleted", 3, "user", "5m"],
			["admin", 4, "user", "5m"],
			["pending", 1, "2fa_pending", "5m"],
			["expired", 1, "user", "-1s"],
		]) {
			tokens[name] = (await Token().create({ attrs: { id }, scope: [scope], expiresIn })).token;
		}
		tokens.invalid = "invalid-jwt";
		const app = express();
		app.use(express.json(), cookieParser(), jwt());
		app.use("/api/settings", settings);
		app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
		server = app.listen(0, "127.0.0.1");
		await new Promise((resolve) => server.once("listening", resolve));
		origin = `http://127.0.0.1:${server.address().port}`;
	});
	afterAll(async () => {
		server?.closeAllConnections();
		if (server) await new Promise((resolve) => server.close(resolve));
		await state.db.destroy();
	});

	it.each(["anonymous", "user", "disabled", "deleted", "pending", "expired", "invalid", "admin"])(
		"returns only the public provider label and enabled flag for %s",
		async (name) => {
			const response = await fetch(`${origin}/api/settings/oidc-config`, {
				headers: tokens[name] ? { Cookie: `shieldpm_jwt=${tokens[name]}` } : {},
			});
			expect(response.status, await response.clone().text()).toBe(200);
			expect(await response.json()).toEqual({
				id: "oidc-config",
				name: "OIDC",
				description: "OIDC configuration",
				value: "enabled",
				meta: { name: "Company SSO", enabled: true },
			});
		},
	);

	it.each(["anonymous", "user", "disabled", "deleted", "pending", "expired", "invalid"])(
		"continues to deny private settings and OIDC writes for %s",
		async (name) => {
			const headers = {
				"Content-Type": "application/json",
				...(tokens[name] ? { Cookie: `shieldpm_jwt=${tokens[name]}` } : {}),
			};
			for (const [method, path] of [
				["GET", "ai-config"],
				["PUT", "oidc-config"],
			]) {
				const response = await fetch(`${origin}/api/settings/${path}`, {
					method,
					headers,
					...(method === "PUT" ? { body: JSON.stringify({ meta: { enabled: false } }) } : {}),
				});
				expect([400, 401, 403], await response.clone().text()).toContain(response.status);
				expect(await response.text()).not.toContain("must-stay-private");
			}
		},
	);

	it.each(["anonymous", "user", "disabled", "deleted", "pending", "expired", "invalid"])(
		"denies the settings list to %s",
		async (name) => {
			const response = await fetch(`${origin}/api/settings`, {
				headers: tokens[name] ? { Cookie: `shieldpm_jwt=${tokens[name]}` } : {},
			});
			expect([400, 401, 403]).toContain(response.status);
			expect(await response.text()).not.toContain("must-stay-private");
		},
	);

	it("masks every secret in the settings list for administrators", async () => {
		const response = await fetch(`${origin}/api/settings`, {
			headers: { Cookie: `shieldpm_jwt=${tokens.admin}` },
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		const body = await response.json();
		expect(JSON.stringify(body)).not.toContain("must-stay-private");
		expect(body.find((row) => row.id === "ai-config").meta).toEqual({
			api_key: "********",
			api_key_configured: true,
		});
		const oidc = body.find((row) => row.id === "oidc-config").meta;
		expect(oidc).toMatchObject({
			clientID: "test-client",
			clientSecret: "********",
			clientSecret_configured: true,
		});
		expect(oidc).not.toHaveProperty("clientSecret", "must-stay-private");
	});

	it("keeps the saved secret when a masked form value is submitted", () => {
		expect(
			preserveMetaSecrets(
				{ name: "Company SSO", clientSecret: "********" },
				{ clientSecret: "must-stay-private" },
			),
		).toEqual({ name: "Company SSO", clientSecret: "must-stay-private" });
	});

	it("masks the secret on the single-setting route for administrators", async () => {
		const response = await fetch(`${origin}/api/settings/ai-config`, {
			headers: { Cookie: `shieldpm_jwt=${tokens.admin}` },
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.json()).toEqual({
			id: "ai-config",
			name: "AI",
			description: "AI configuration",
			value: "enabled",
			meta: { api_key: "********", api_key_configured: true },
		});
	});
});
