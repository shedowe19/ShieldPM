import crypto from "node:crypto";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, keys: null }));
const operations = vi.hoisted(() => ({ start: vi.fn(), restart: vi.fn(), updateDdns: vi.fn() }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => true,
	isPostgres: () => false,
	getEncryptionKey: () => "01".repeat(32),
	getPrivateKey: () => state.keys.privateKey,
	getPublicKey: () => state.keys.publicKey,
}));
vi.mock("../../internal/cloudflared.js", () => ({ default: { start: operations.start, restart: operations.restart } }));
vi.mock("../../internal/ddns.js", () => ({
	default: {
		process: vi.fn(),
		getWanIps: async () => ({ ipv4: "192.0.2.1" }),
		updateProvider: operations.updateDdns,
		runProvider: async (id) => {
			const { default: Provider } = await import("../../models/ddns_provider.js");
			const ips = { ipv4: "192.0.2.1" };
			return { ...(await operations.updateDdns(await Provider.query().findById(id), ips)), ips };
		},
	},
}));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: vi.fn() } }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/nginx.js", () => ({
	default: { bulkGenerateConfigs: vi.fn(), reload: vi.fn(), withConfigurationLock: (operation) => operation() },
}));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: { start: vi.fn(), restart: vi.fn(), stop: vi.fn() } }));

import accessList from "../../internal/access-list.js";
import jwt from "../../lib/express/jwt.js";
import CloudflaredTunnel from "../../models/cloudflared_tunnel.js";
import DdnsProvider from "../../models/ddns_provider.js";
import Token from "../../models/token.js";
import accessRouter from "../../routes/nginx/access_lists.js";
import cloudRouter from "../../routes/nginx/cloudflared.js";
import ddnsRouter from "../../routes/nginx/ddns_providers.js";
import { getCompiledSchema } from "../../schema/index.js";

const secret = "synthetic-secret-do-not-return";
const accessMeta = {
	auth_type: "oauth2_proxy",
	oauth2_client_id: "public-client-id",
	oauth2_client_secret: secret,
	oauth2_cookie_secret: secret,
	oidc_client_secret: secret,
};
let server;
let origin;
const tokens = {};
const request = async (user, resource, suffix = "", body = undefined) => {
	const response = await fetch(`${origin}/api/nginx/${resource}${suffix}`, {
		method: body ? "PUT" : "GET",
		headers: { Authorization: `Bearer ${tokens[user]}`, "Content-Type": "application/json" },
		...(body ? { body: JSON.stringify(body) } : {}),
	});
	return { status: response.status, body: await response.json() };
};

beforeAll(async () => {
	await getCompiledSchema();
	state.keys = crypto.generateKeyPairSync("rsa", {
		modulusLength: 2048,
		privateKeyEncoding: { type: "pkcs8", format: "pem" },
		publicKeyEncoding: { type: "spki", format: "pem" },
	});
	await state.db.schema.createTable("user", (table) => {
		table.integer("id").primary();
		table.json("roles");
		table.integer("is_disabled").defaultTo(0);
		table.integer("is_deleted").defaultTo(0);
	});
	await state.db.schema.createTable("user_permission", (table) => {
		table.increments("id");
		table.integer("user_id");
		table.string("visibility");
		for (const key of ["access_lists", "cloudflared_tunnels", "ddns_providers"]) table.string(key);
	});
	await state.db.schema.createTable("proxy_host", (table) => {
		table.increments("id");
		table.integer("access_list_id");
		table.integer("is_deleted").defaultTo(0);
	});
	for (const name of ["cloudflared_tunnel", "ddns_provider", "access_list"]) {
		await state.db.schema.createTable(name, (table) => {
			table.increments("id");
			table.integer("owner_user_id");
			table.string("name");
			table.string("created_on");
			table.string("modified_on");
			table.json("meta");
			if (name === "ddns_provider") {
				table.string("provider");
				table.json("config");
				table.json("domains");
				table.string("ip_ver");
				table.integer("enabled");
			} else {
				table.integer("is_deleted").defaultTo(0);
				if (name === "cloudflared_tunnel") {
					table.string("token");
					table.integer("status").defaultTo(0);
				} else {
					for (const field of ["satisfy_any", "pass_auth", "mtls_enabled", "mtls_use_internal"])
						table.integer(field).defaultTo(0);
					table.string("mtls_certificate");
				}
			}
		});
	}
	for (const name of ["access_list_auth", "access_list_client"]) {
		await state.db.schema.createTable(name, (table) => {
			table.increments("id");
			table.integer("access_list_id");
			table.string("created_on");
			table.string("modified_on");
			if (name === "access_list_auth") {
				table.string("username");
				table.string("password");
			} else {
				table.string("address");
				table.string("directive");
			}
		});
	}
	for (const [name, id, visibility, permission] of [
		["own", 1, "user", "view"],
		["all", 3, "all", "view"],
		["manager", 4, "all", "manage"],
	]) {
		await state.db("user").insert({ id, roles: "[]" });
		await state.db("user_permission").insert({
			user_id: id,
			visibility,
			access_lists: permission,
			cloudflared_tunnels: permission,
			ddns_providers: permission,
		});
		tokens[name] = (await Token().create({ attrs: { id }, scope: ["user"], expiresIn: "5m" })).token;
	}
	const app = express();
	app.use(express.json(), jwt());
	app.use("/api/nginx/cloudflared-tunnels", cloudRouter);
	app.use("/api/nginx/ddns-providers", ddnsRouter);
	app.use("/api/nginx/access-lists", accessRouter);
	app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
	server = app.listen(0, "127.0.0.1");
	await new Promise((resolve) => server.once("listening", resolve));
	origin = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
	vi.restoreAllMocks();
	vi.clearAllMocks();
	operations.start.mockResolvedValue();
	operations.restart.mockResolvedValue();
	operations.updateDdns.mockResolvedValue({ success: true });
	vi.spyOn(accessList, "build").mockResolvedValue();
	for (const name of ["cloudflared_tunnel", "ddns_provider", "access_list"]) await state.db(name).delete();
	for (const [id, owner] of [
		[1, 1],
		[2, 2],
	]) {
		await CloudflaredTunnel.query().insert({ id, owner_user_id: owner, name: "Tunnel", token: secret, meta: {} });
		await state.db("ddns_provider").insert({
			id,
			owner_user_id: owner,
			name: "DNS",
			provider: "cloudflare",
			config: JSON.stringify({ token: secret, zone_id: "public-zone" }),
			domains: '["example.test"]',
			meta: "{}",
		});
		await state
			.db("access_list")
			.insert({ id, owner_user_id: owner, name: "Access", meta: JSON.stringify(accessMeta) });
	}
});
afterAll(async () => {
	vi.restoreAllMocks();
	server?.closeAllConnections();
	if (server) await new Promise((resolve) => server.close(resolve));
	await state.db.destroy();
});

describe("public service credential boundaries with RSA authentication and SQLite", () => {
	it.each(["cloudflared-tunnels", "ddns-providers", "access-lists"])(
		"redacts %s lists and detail for own and all visibility",
		async (resource) => {
			for (const user of ["own", "all"]) {
				const list = await request(user, resource);
				expect(list.status).toBe(200);
				expect(list.body).toHaveLength(user === "own" ? 1 : 2);
				expect(JSON.stringify(list.body)).not.toContain(secret);
				const detail = await request(user, resource, user === "own" ? "/1" : "/2");
				expect(detail.status).toBe(200);
				expect(JSON.stringify(detail.body)).not.toContain(secret);
			}
			expect((await request("own", resource, "/2")).status).toBe(404);
		},
	);

	it.each([{}, { token: "" }])("keeps a tunnel credential while renaming: %j", async (credential) => {
		const result = await request("manager", "cloudflared-tunnels", "/2", { name: "Renamed", ...credential });
		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({ name: "Renamed", has_token: true });
		expect(result.body).not.toHaveProperty("token");
		expect((await CloudflaredTunnel.query().findById(2)).token).toBe(secret);
		expect(operations.restart).toHaveBeenCalledWith(expect.objectContaining({ token: secret }));
	});

	it.each([{}, { token: "" }])("keeps DDNS credentials and its operational test: %j", async (credential) => {
		const result = await request("manager", "ddns-providers", "/2", {
			name: "Renamed",
			config: { zone_id: "new-zone", ...credential },
		});
		expect(result.status).toBe(200);
		expect(result.body.config).toEqual({ zone_id: "new-zone" });
		expect(result.body.has_credentials).toBe(true);
		const saved = await state.db("ddns_provider").where("id", 2).first();
		expect(JSON.parse(saved.config)).toEqual({ token: secret, zone_id: "new-zone" });
		const response = await fetch(`${origin}/api/nginx/ddns-providers/2/test`, {
			method: "POST",
			headers: { Authorization: `Bearer ${tokens.manager}` },
		});
		expect(response.status).toBe(200);
		expect(operations.updateDdns).toHaveBeenCalledWith(
			expect.objectContaining({ config: { token: secret, zone_id: "new-zone" } }),
			expect.anything(),
		);
	});

	it("hides a custom DDNS URL and preserves it on a blank edit", async () => {
		await state
			.db("ddns_provider")
			.where("id", 2)
			.update({
				provider: "custom",
				config: JSON.stringify({ url: `https://user:${secret}@example.test/update?token=${secret}` }),
			});
		const result = await request("manager", "ddns-providers", "/2", { name: "Renamed", config: { url: "" } });
		expect(result.body).toMatchObject({ config: {}, has_credentials: true });
		expect(JSON.stringify(result.body)).not.toContain(secret);
		expect(JSON.parse((await state.db("ddns_provider").where("id", 2).first()).config).url).toContain(secret);
	});

	it("does not transfer a saved token when changing DDNS providers", async () => {
		const result = await request("manager", "ddns-providers", "/2", { provider: "duckdns" });
		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({ config: {}, has_credentials: false });
		expect(JSON.parse((await state.db("ddns_provider").where("id", 2).first()).config)).toEqual({});
	});

	it.each(["cloudflared-tunnels", "ddns-providers", "access-lists"])(
		"never echoes credentials when creating %s",
		async (resource) => {
			const payloads = {
				"cloudflared-tunnels": { name: "New tunnel", token: secret },
				"ddns-providers": {
					name: "New DNS",
					provider: "cloudflare",
					domains: ["example.test"],
					config: { token: secret, zone_id: "public-zone" },
				},
				"access-lists": { name: "New ACL", meta: accessMeta, items: [], clients: [] },
			};
			const response = await fetch(`${origin}/api/nginx/${resource}`, {
				method: "POST",
				headers: { Authorization: `Bearer ${tokens.manager}`, "Content-Type": "application/json" },
				body: JSON.stringify(payloads[resource]),
			});
			const result = await response.json();
			expect(response.status, JSON.stringify(result)).toBe(201);
			expect(JSON.stringify(result)).not.toContain(secret);
		},
	);

	it("preserves hidden Access List secrets and replaces explicit inputs", async () => {
		const result = await request("manager", "access-lists", "/2", {
			name: "Renamed",
			meta: {
				auth_type: "oauth2_proxy",
				oauth2_client_id: "public-new-id",
				oauth2_client_secret: "",
				oauth2_cookie_secret: "replacement",
			},
		});
		expect(result.status, JSON.stringify(result.body)).toBe(200);
		expect(result.body.meta).toEqual({ auth_type: "oauth2_proxy", oauth2_client_id: "public-new-id" });
		expect(result.body.credentials_configured).toEqual({
			oauth2_client_secret: true,
			oauth2_cookie_secret: true,
			oidc_client_secret: true,
		});
		const saved = JSON.parse((await state.db("access_list").where("id", 2).first()).meta);
		expect(saved).toMatchObject({
			oauth2_client_secret: secret,
			oauth2_cookie_secret: "replacement",
			oidc_client_secret: secret,
		});
		expect(accessList.build).toHaveBeenCalledWith(expect.objectContaining({ meta: saved }), { immutable: true });
	});

	it("does not restore Access List secrets rotated after the initial snapshot", async () => {
		const get = accessList.get;
		vi.spyOn(accessList, "get").mockImplementationOnce(async (...args) => {
			const snapshot = await get(...args);
			await state
				.db("access_list")
				.where("id", 2)
				.update({
					meta: JSON.stringify({
						...accessMeta,
						oauth2_client_secret: "rotated-client",
						oauth2_cookie_secret: "rotated-cookie",
					}),
				});
			return snapshot;
		});
		const result = await request("manager", "access-lists", "/2", {
			name: "Delayed rename",
			meta: { auth_type: "oauth2_proxy", oauth2_client_id: "public-client-id" },
		});
		expect(result.status).toBe(200);
		expect(JSON.parse((await state.db("access_list").where("id", 2).first()).meta)).toMatchObject({
			oauth2_client_secret: "rotated-client",
			oauth2_cookie_secret: "rotated-cookie",
		});
	});

	it("redacts legacy string metadata and camel-case secret aliases", async () => {
		await state
			.db("access_list")
			.where("id", 2)
			.update({
				meta: JSON.stringify(
					JSON.stringify({
						authType: "oidc",
						oidcClientSecret: secret,
						oauth2ClientSecret: secret,
						oauth2CookieSecret: secret,
						retained: "public",
					}),
				),
			});
		const result = await request("all", "access-lists", "/2");
		expect(result.status).toBe(200);
		expect(result.body.meta).toEqual({ authType: "oidc", retained: "public" });
		expect(JSON.stringify(result.body)).not.toContain(secret);
		expect(result.body.credentials_configured).toEqual({
			oauth2_client_secret: true,
			oauth2_cookie_secret: true,
			oidc_client_secret: true,
		});
	});

	it("merges DDNS credentials after a waiting write transaction acquires its current row", async () => {
		let release;
		let entered;
		const waiting = new Promise((resolve) => {
			release = resolve;
		});
		const pending = new Promise((resolve) => {
			entered = resolve;
		});
		const transaction = DdnsProvider.transaction;
		vi.spyOn(DdnsProvider, "transaction").mockImplementationOnce(async (...args) => {
			entered();
			await waiting;
			return transaction.apply(DdnsProvider, args);
		});
		const editing = request("manager", "ddns-providers", "/2", {
			name: "Delayed rename",
			config: { token: "", zone_id: "new-zone" },
		});
		await pending;
		await state
			.db("ddns_provider")
			.where("id", 2)
			.update({ config: JSON.stringify({ token: "rotated-token", zone_id: "old-zone" }) });
		release();
		expect((await editing).status).toBe(200);
		expect(JSON.parse((await state.db("ddns_provider").where("id", 2).first()).config)).toEqual({
			token: "rotated-token",
			zone_id: "new-zone",
		});
	});

	it.each(["cloudflared-tunnels", "ddns-providers", "access-lists"])(
		"still rejects writes by a view user at %s",
		async (resource) => {
			expect((await request("all", resource, "/2", { name: "Forbidden" })).status).toBe(403);
		},
	);
});
