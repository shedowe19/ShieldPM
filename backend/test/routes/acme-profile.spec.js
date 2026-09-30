import express from "express";
import knex from "knex";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	access: { can: vi.fn() },
	policy: "standard",
	db: null,
	query: vi.fn(),
	certificateQuery: vi.fn(),
	patch: vi.fn(),
	execFile: vi.fn(),
	audit: vi.fn(),
	acme: vi.fn(),
	updateCertificate: vi.fn(),
}));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = state.access;
		next();
	},
}));
vi.mock("../../models/setting.js", () => ({ default: { query: state.query } }));
vi.mock("../../models/certificate.js", async () => {
	const { Model } = await import("objection");
	class Certificate extends Model {
		static get tableName() {
			return "certificate";
		}
		static get jsonAttributes() {
			return ["domain_names", "meta"];
		}
	}
	return { default: { query: (...args) => state.certificateQuery(...args) || Certificate.query(state.db) } };
});
vi.mock("../../internal/acme-options.js", () => ({ default: { getPublicPolicy: state.acme } }));
vi.mock("../../lib/utils.js", () => ({ default: { execFile: state.execFile } }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: state.audit } }));
vi.mock("../../internal/certificate.js", () => ({ default: { update: state.updateCertificate } }));
vi.mock("../../internal/pki.js", () => ({ default: {} }));

import errs from "../../lib/error.js";
import router from "../../routes/nginx/certificates.js";
import { getCompiledSchema } from "../../schema/index.js";

describe("ACME default profile HTTP routes", () => {
	let server;
	let origin;
	const send = (data) =>
		fetch(`${origin}/nginx/certificates/acme-profile`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		});

	beforeAll(async () => {
		await getCompiledSchema();
		state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
		await state.db.schema.createTable("certificate", (table) => {
			table.integer("id").primary();
			table.string("provider");
			table.integer("is_deleted");
			table.text("domain_names");
			table.text("meta");
		});
		const app = express();
		app.use(express.json());
		app.use("/nginx/certificates", router);
		app.use((err, _req, res, _next) => res.status(err.status ?? 500).json({ error: err.message }));
		server = await new Promise((resolve, reject) => {
			const instance = app.listen(0, "127.0.0.1", (error) => (error ? reject(error) : resolve(instance)));
		});
		origin = `http://127.0.0.1:${server.address().port}`;
	});

	beforeEach(async () => {
		vi.resetAllMocks();
		state.acme.mockResolvedValue({
			server: "https://acme-v02.api.letsencrypt.org/directory",
			server_tls_verify: true,
		});
		await state.db("certificate").delete();
		vi.stubEnv("ACME_SERVER", "");
		vi.stubEnv("ACME_SERVER_TLS_VERIFY", "");
		state.policy = "standard";
		state.query.mockImplementation(() => ({
			where: () => ({
				first: async () => ({ id: "acme-profile", value: state.policy }),
				patch: state.patch,
			}),
		}));
		state.patch.mockImplementation(async ({ value }) => {
			state.policy = value;
			return 1;
		});
		state.execFile.mockImplementation(async (command) =>
			command === "certbot"
				? "--required-profile PROFILE --preferred-profile PROFILE"
				: JSON.stringify({ meta: { profiles: { shortlived: "https://ca.example.test/profile" } } }),
		);
	});

	afterEach(() => vi.unstubAllEnvs());

	afterAll(async () => {
		await state.db?.destroy();
		if (!server) return;
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	});

	it.each(["shortlived", "custom-profile", "shortlived --force-renewal"])(
		"returns only the saved default through the static route while ignoring ACME_PROFILE=%s",
		async (environment) => {
			vi.stubEnv("ACME_PROFILE", environment);
			const response = await fetch(`${origin}/nginx/certificates/acme-profile`);
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ profile: "standard" });
			expect(state.access.can).toHaveBeenCalledExactlyOnceWith("certificates:list");
			expect(state.execFile).not.toHaveBeenCalled();
			expect(state.certificateQuery).not.toHaveBeenCalled();
			expect(state.updateCertificate).not.toHaveBeenCalled();
		},
	);

	it.each(["standard", "shortlived"])(
		"updates %s with administrator authorization and returns only the saved profile",
		async (profile) => {
			vi.stubEnv("ACME_PROFILE", profile === "standard" ? "shortlived" : "classic");
			const response = await send({ profile });
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ profile });
			expect(state.access.can).toHaveBeenCalledExactlyOnceWith("settings:update", "acme-profile");
			expect(state.patch).toHaveBeenCalledExactlyOnceWith({ value: profile });
			expect(state.policy).toBe(profile);
			expect(state.updateCertificate).not.toHaveBeenCalled();
			const saved = await fetch(`${origin}/nginx/certificates/acme-profile`);
			expect(await saved.json()).toEqual({ profile });
		},
	);

	it.each([
		{},
		{ profile: "inherit" },
		{ profile: "classic" },
		{ profile: "SHORTLIVED" },
		{ profile: null },
		{ profile: true },
		{ profile: 1 },
		{ profile: ["shortlived"] },
		{ profile: "shortlived", id: "acme-profile" },
		{ profile: "standard", source: "settings" },
		{ profile: "shortlived", environmentProfile: "shortlived" },
	])("rejects invalid or injected fields before profile checks: %j", async (payload) => {
		const response = await send(payload);
		expect(response.status).toBe(400);
		expect(state.execFile).not.toHaveBeenCalled();
		expect(state.patch).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
		expect(state.updateCertificate).not.toHaveBeenCalled();
	});

	it.each(["GET", "PUT"])("returns 403 on denied %s permission without external calls or writes", async (method) => {
		state.access.can.mockRejectedValue(new errs.PermissionError());
		const response =
			method === "GET"
				? await fetch(`${origin}/nginx/certificates/acme-profile`)
				: await send({ profile: "shortlived" });
		expect(response.status).toBe(403);
		expect(state.query).not.toHaveBeenCalled();
		expect(state.certificateQuery).not.toHaveBeenCalled();
		expect(state.execFile).not.toHaveBeenCalled();
		expect(state.patch).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
	});

	it("reports an unsupported CA as 400 and retains the previous default", async () => {
		state.policy = "standard";
		state.execFile.mockResolvedValueOnce("--required-profile --preferred-profile").mockResolvedValueOnce("{}");
		const response = await send({ profile: "shortlived" });
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "The configured ACME server does not offer the shortlived profile",
		});
		expect(state.policy).toBe("standard");
		expect(state.patch).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
	});

	it("reports a persistence error and does not emit a successful audit", async () => {
		state.policy = "shortlived";
		state.patch.mockRejectedValue(new Error("database unavailable"));
		const response = await send({ profile: "standard" });
		expect(response.status).toBe(500);
		expect(state.policy).toBe("shortlived");
		expect(state.audit).not.toHaveBeenCalled();
	});

	it("rejects Short-lived with HTTP 400 when it would apply to an incompatible legacy certificate", async () => {
		state.policy = "standard";
		await state.db("certificate").insert({
			id: 17,
			provider: "letsencrypt",
			is_deleted: 0,
			domain_names: JSON.stringify(Array.from({ length: 26 }, (_, index) => `host${index}.example.test`)),
			meta: "{}",
		});
		const response = await send({ profile: "shortlived" });
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Certificate 17 has more than 25 domain names and no explicit profile. Keep Standard or replace this certificate with certificates containing at most 25 domain names before selecting the global Short-lived default.",
		});
		expect(state.policy).toBe("standard");
		expect(state.execFile).not.toHaveBeenCalled();
		expect(state.patch).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
	});
});
