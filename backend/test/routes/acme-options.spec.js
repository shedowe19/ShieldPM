import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), generic: vi.fn(), access: { can: vi.fn() } }));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = state.access;
		next();
	},
}));
vi.mock("../../internal/acme-options.js", () => ({ default: { get: state.get, update: state.update } }));
vi.mock("../../internal/certificate-options.js", () => ({ default: { get: vi.fn(), update: vi.fn() } }));
vi.mock("../../internal/ip-ranges-options.js", () => ({ default: { get: vi.fn(), update: vi.fn() } }));
vi.mock("../../internal/analytics-options.js", () => ({ default: { get: vi.fn(), update: vi.fn() } }));
vi.mock("../../internal/nginx-options.js", () => ({ default: { get: vi.fn(), update: vi.fn() } }));
vi.mock("../../internal/setting.js", () => ({ default: { get: state.generic, update: state.generic } }));

import errs from "../../lib/error.js";
import router from "../../routes/settings.js";
import { getCompiledSchema } from "../../schema/index.js";

const policy = {
	server: "https://ca.example.org/directory",
	email: "admin@example.org",
	account_id: "",
	eab_kid: "synthetic-kid",
	agree_tos: true,
	must_staple: false,
	ocsp_stapling: false,
	server_tls_verify: true,
	custom_ocsp_stapling: false,
	default_certificate_id: 0,
};

describe("ACME options HTTP routes and noncoercing secret validation", () => {
	let server;
	let origin;
	const put = (data) =>
		fetch(`${origin}/settings/acme-options`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		});
	beforeAll(async () => {
		await getCompiledSchema();
		const app = express();
		app.use(express.json());
		app.use("/settings", router);
		app.use((err, _req, res, _next) =>
			res.status(err.status ?? 500).json({ error: err.message, debug: err.debug }),
		);
		server = await new Promise((resolve, reject) => {
			const instance = app.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve(instance)));
		});
		origin = `http://127.0.0.1:${server.address().port}`;
	});
	beforeEach(() => {
		vi.resetAllMocks();
		state.get.mockResolvedValue({ ...policy, eab_hmac_key_set: true });
		state.update.mockResolvedValue({ ...policy, eab_hmac_key_set: true });
	});
	afterAll(async () => {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	});
	it("reads through the typed route and returns only a credential marker", async () => {
		const result = await fetch(`${origin}/settings/acme-options`);
		expect(await result.json()).toEqual({ ...policy, eab_hmac_key_set: true });
		expect(state.get).toHaveBeenCalledExactlyOnceWith(state.access);
		expect(state.generic).not.toHaveBeenCalled();
	});
	it.each([{}, { eab_hmac_key: "c3ludGhldGlj" }, { eab_hmac_key: null }])(
		"preserves the deliberate retain/replace/clear request",
		async (secret) => {
			const request = { ...policy, ...secret };
			expect((await put(request)).status).toBe(200);
			expect(state.update).toHaveBeenCalledExactlyOnceWith(state.access, request);
			expect(state.generic).not.toHaveBeenCalled();
		},
	);
	it.each([
		{ ...policy, eab_hmac_key: "" },
		{ ...policy, eab_hmac_key: false },
		{ ...policy, eab_hmac_key: 123 },
		{ ...policy, eab_hmac_key: "synthetic secret\ninvalid" },
		{ ...policy, eab_hmac_key_set: true },
		{ ...policy, server_tls_verify: "false" },
		{ ...policy, default_certificate_id: "0" },
	])("rejects malformed payloads without coercing, echoing or mutating credentials", async (request) => {
		const result = await put(request);
		expect(result.status).toBe(400);
		const response = await result.json();
		expect(response).not.toHaveProperty("debug");
		expect(JSON.stringify(response)).not.toContain("synthetic secret");
		expect(state.update).not.toHaveBeenCalled();
	});
	it("checks permission before validating a credential-bearing payload", async () => {
		state.access.can.mockRejectedValueOnce(new errs.PermissionError());
		expect((await put({ ...policy, eab_hmac_key: false })).status).toBe(403);
		expect(state.update).not.toHaveBeenCalled();
	});
});
