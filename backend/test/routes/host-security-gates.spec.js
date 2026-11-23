import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	db: null,
	access: null,
	createClientCert: vi.fn(),
	auditAdd: vi.fn(),
	sentinel: vi.fn(),
}));

vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = state.access;
		next();
	},
}));
// The gate under test runs before the host transaction. Reaching this seam
// proves that validation admitted the request without touching a database.
vi.mock("../../lib/host-domain-claims.js", () => ({
	withHostDomainClaims: async () => {
		state.sentinel();
		throw Object.assign(new Error("SENTINEL: host persistence reached"), { status: 418 });
	},
}));
vi.mock("../../internal/pki.js", () => ({
	default: { createClientCert: state.createClientCert, getRootCa: vi.fn() },
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: state.auditAdd } }));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
vi.mock("express-fileupload", () => ({ default: () => vi.fn() }));
vi.mock("express-rate-limit", () => ({ default: () => (_req, _res, next) => next() }));

import certificatesRouter from "../../routes/nginx/certificates.js";
import proxyHostsRouter from "../../routes/nginx/proxy_hosts.js";
import { getCompiledSchema } from "../../schema/index.js";

const access = (admin) => ({
	can: vi.fn().mockResolvedValue({}),
	isAdmin: vi.fn().mockResolvedValue(admin),
	token: { getUserId: () => 7 },
});

const base = {
	domain_names: ["app.test"],
	forward_scheme: "http",
	forward_host: "backend.test",
	forward_port: 80,
};

let server;
let origin;
beforeAll(async () => {
	await getCompiledSchema();
	const app = express();
	app.use(express.json());
	app.use("/nginx/proxy-hosts", proxyHostsRouter);
	app.use("/nginx/certificates", certificatesRouter);
	app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: error.message }));
	server = await new Promise((resolve) => {
		const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
	});
	origin = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
	server.closeAllConnections();
	await new Promise((resolve) => server.close(resolve));
	await state.db?.destroy();
});
beforeEach(() => {
	vi.clearAllMocks();
	state.access = access(false);
});

const post = (path, body) =>
	fetch(`${origin}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

describe("proxy-host creation security gates", () => {
	it("rejects path forwarding for a delegated user before persistence", async () => {
		const response = await post("/nginx/proxy-hosts", { ...base, forward_scheme: "path", forward_host: "/data" });
		// host-input raises ValidationError, which app.js maps to 400 rather than 403/422.
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: expect.stringMatching(/administrator/) });
		expect(state.sentinel).not.toHaveBeenCalled();
	});

	it("rejects a non-empty advanced_config for a delegated user before persistence", async () => {
		const response = await post("/nginx/proxy-hosts", { ...base, advanced_config: "alias /data;" });
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: expect.stringMatching(/administrator/) });
		expect(state.sentinel).not.toHaveBeenCalled();
	});

	it.each([
		["path forwarding", { forward_scheme: "path", forward_host: "/data/websites/site" }],
		["advanced_config", { advanced_config: "alias /data;" }],
	])("admits an administrator using %s", async (_, overrides) => {
		state.access = access(true);
		const response = await post("/nginx/proxy-hosts", { ...base, ...overrides });
		expect(response.status).toBe(418);
		expect(await response.json()).toMatchObject({ error: "SENTINEL: host persistence reached" });
		expect(state.sentinel).toHaveBeenCalledOnce();
	});
});

describe("internal client certificate issuance gate", () => {
	it("denies a delegated user before generating a client identity", async () => {
		const response = await post("/nginx/certificates/internal/client", {
			common_name: "Client",
			password: "test-password",
		});
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ error: expect.stringMatching(/administrator/) });
		expect(state.createClientCert).not.toHaveBeenCalled();
		expect(state.auditAdd).not.toHaveBeenCalled();
	});
});
