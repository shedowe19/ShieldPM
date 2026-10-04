import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	access: { can: vi.fn() },
	jwt: vi.fn(),
	status: vi.fn(),
	getList: vi.fn(),
	events: [],
}));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => state.jwt }));
vi.mock("../../lib/firewall-geoip.js", () => ({ getFirewallGeoipStatus: state.status }));
vi.mock("../../internal/firewall-list.js", () => ({ default: { get: state.getList } }));

import router from "../../routes/nginx/firewall_lists.js";

describe("protected firewall GeoIP readiness route", () => {
	let server;
	let origin;
	beforeAll(async () => {
		const app = express();
		app.use("/nginx/firewall-lists", router);
		app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: error.message }));
		server = await new Promise((resolve) => {
			const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
		});
		origin = `http://127.0.0.1:${server.address().port}`;
	});
	beforeEach(() => {
		vi.clearAllMocks();
		state.events = [];
		state.jwt.mockImplementation((req, res, next) => {
			state.events.push("jwt");
			if (req.headers.authorization !== "Bearer test-token") {
				const error = new Error("Authentication required");
				error.status = 401;
				return next(error);
			}
			res.locals.access = state.access;
			next();
		});
		state.access.can.mockImplementation(async () => {
			state.events.push("permission");
		});
		state.status.mockImplementation(async () => {
			state.events.push("read");
		});
	});
	afterAll(async () => {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	});

	it.each([
		{ available: true, module_enabled: true, database_present: true, reason: null },
		{ available: false, module_enabled: true, database_present: false, reason: "database_missing" },
		{
			available: false,
			module_enabled: true,
			database_present: false,
			reason: "country_variable_missing",
			asn: { available: true, module_enabled: true, database_present: true, reason: null },
		},
	])("returns the exact public readiness payload after JWT and proxy-host permission checks: %j", async (status) => {
		state.status.mockImplementationOnce(async () => {
			state.events.push("read");
			return status;
		});
		const response = await fetch(`${origin}/nginx/firewall-lists/geoip`, {
			headers: { Authorization: "Bearer test-token" },
		});
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(body).toEqual(status);
		expect(Object.keys(body).sort()).toEqual(
			[
				...(Object.hasOwn(status, "asn") ? ["asn"] : []),
				"available",
				"database_present",
				"module_enabled",
				"reason",
			].sort(),
		);
		expect(JSON.stringify(body)).not.toMatch(/\/data\/|\/etc\/|\.mmdb/);
		expect(state.events).toEqual(["jwt", "permission", "read"]);
		expect(state.jwt).toHaveBeenCalledOnce();
		expect(state.access.can).toHaveBeenCalledExactlyOnceWith("proxy_hosts:list");
		expect(state.status).toHaveBeenCalledExactlyOnceWith();
		expect(state.getList).not.toHaveBeenCalled();
	});
	it("rejects permission denial before reading GeoIP configuration", async () => {
		state.access.can.mockImplementationOnce(async () => {
			state.events.push("permission");
			const error = new Error("Permission Denied");
			error.status = 403;
			throw error;
		});
		const response = await fetch(`${origin}/nginx/firewall-lists/geoip`, {
			headers: { Authorization: "Bearer test-token" },
		});
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: "Permission Denied" });
		expect(state.events).toEqual(["jwt", "permission"]);
		expect(state.status).not.toHaveBeenCalled();
	});
	it("runs JWT middleware and blocks unauthenticated requests before authorization or GeoIP reads", async () => {
		const response = await fetch(`${origin}/nginx/firewall-lists/geoip`);
		expect(response.status).toBe(401);
		expect(state.events).toEqual(["jwt"]);
		expect(state.access.can).not.toHaveBeenCalled();
		expect(state.status).not.toHaveBeenCalled();
	});
});
