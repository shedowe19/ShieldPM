import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	certificate: { get: vi.fn(), update: vi.fn() },
	ipRanges: { get: vi.fn(), update: vi.fn() },
	generic: { get: vi.fn(), update: vi.fn(), getAll: vi.fn() },
	access: { can: vi.fn() },
}));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = state.access;
		next();
	},
}));
vi.mock("../../internal/certificate-options.js", () => ({ default: state.certificate }));
vi.mock("../../internal/ip-ranges-options.js", () => ({ default: state.ipRanges }));
vi.mock("../../internal/setting.js", () => ({ default: state.generic }));

import errs from "../../lib/error.js";
import router from "../../routes/settings.js";
import { getCompiledSchema } from "../../schema/index.js";

describe("typed application options HTTP routes", () => {
	let server;
	let origin;
	const send = (id, data) =>
		fetch(`${origin}/settings/${id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		});
	const cases = [
		["certificate-options", state.certificate, { key_type: "rsa", renewal_interval_hours: 3 }],
		["ip-ranges-options", state.ipRanges, { enabled: true, refresh_interval_hours: 18 }],
	];
	beforeAll(async () => {
		await getCompiledSchema();
		const app = express();
		app.use(express.json());
		app.use("/settings", router);
		app.use((err, _req, res, _next) => res.status(err.status ?? 500).json({ error: err.message }));
		server = await new Promise((resolve, reject) => {
			const instance = app.listen(0, "127.0.0.1", (error) => (error ? reject(error) : resolve(instance)));
		});
		origin = `http://127.0.0.1:${server.address().port}`;
	});
	beforeEach(() => {
		vi.resetAllMocks();
		for (const [, service, policy] of cases) {
			service.get.mockResolvedValue(policy);
			service.update.mockImplementation(async (_access, data) => data);
		}
	});
	afterAll(async () => {
		if (!server) return;
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	});
	it.each(cases)("reads %s through its static route", async (id, service, policy) => {
		const response = await fetch(`${origin}/settings/${id}`);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(policy);
		expect(service.get).toHaveBeenCalledExactlyOnceWith(state.access);
		expect(state.generic.get).not.toHaveBeenCalled();
	});
	it.each(cases)("validates and updates %s through its dedicated service", async (id, service, policy) => {
		const response = await send(id, policy);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(policy);
		expect(service.update).toHaveBeenCalledExactlyOnceWith(state.access, policy);
		expect(state.generic.update).not.toHaveBeenCalled();
	});
	it.each([
		["certificate-options", {}],
		["certificate-options", { key_type: "rsa", renewal_interval_hours: 0 }],
		["certificate-options", { key_type: "rsa", renewal_interval_hours: 13 }],
		["certificate-options", { key_type: "rsa", renewal_interval_hours: 1.5 }],
		["certificate-options", { key_type: "rsa --force-renewal", renewal_interval_hours: 12 }],
		["certificate-options", { key_type: "ecdsa", renewal_interval_hours: 12, value: "configured" }],
		["ip-ranges-options", {}],
		["ip-ranges-options", { enabled: true, refresh_interval_hours: 5 }],
		["ip-ranges-options", { enabled: true, refresh_interval_hours: 600 }],
		["ip-ranges-options", { enabled: true, refresh_interval_hours: 7 }],
		["ip-ranges-options", { enabled: true, refresh_interval_hours: 12, meta: {} }],
	])("rejects invalid %s payload %j before mutation", async (id, policy) => {
		const response = await send(id, policy);
		expect(response.status).toBe(400);
		expect(state.certificate.update).not.toHaveBeenCalled();
		expect(state.ipRanges.update).not.toHaveBeenCalled();
		expect(state.generic.update).not.toHaveBeenCalled();
	});
	it.each(cases)("propagates denied permission and persistence failures for %s", async (id, service, policy) => {
		service.get.mockRejectedValueOnce(new errs.PermissionError());
		expect((await fetch(`${origin}/settings/${id}`)).status).toBe(403);
		service.update.mockRejectedValueOnce(new errs.PermissionError());
		expect((await send(id, policy)).status).toBe(403);
		service.update.mockRejectedValueOnce(new Error("database unavailable"));
		expect((await send(id, policy)).status).toBe(500);
	});
	it("keeps unrelated settings on the generic route", async () => {
		state.generic.get.mockResolvedValue({ id: "default-site", value: "444" });
		const response = await fetch(`${origin}/settings/default-site`);
		expect(response.status).toBe(200);
		expect(state.generic.get).toHaveBeenCalledExactlyOnceWith(state.access, { id: "default-site" });
		expect(state.certificate.get).not.toHaveBeenCalled();
		expect(state.ipRanges.get).not.toHaveBeenCalled();
	});
});
