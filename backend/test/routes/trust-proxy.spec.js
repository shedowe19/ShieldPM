import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../routes/main.js", async () => {
	const { default: express } = await import("express");
	return { default: express.Router() };
});
vi.mock("../../schema/index.js", () => ({ getCompiledSchema: async () => ({}) }));
vi.mock("../../setup.js", () => ({ isSetup: async () => true }));
vi.mock("../../logger.js", () => ({
	debug: vi.fn(),
	express: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../lib/express/demo.js", () => ({ default: (_req, _res, next) => next() }));

import app, { resolveTrustProxy } from "../../app.js";

const DEFAULT_RANGES = ["loopback", "linklocal", "uniquelocal"];

describe("trust proxy resolution", () => {
	it.each([{}, { TRUST_PROXY: "true" }, { TRUST_PROXY: "1" }, { TRUST_PROXY: "yes" }])(
		"never trusts every peer for %j",
		(env) => {
			expect(resolveTrustProxy(env)).toEqual(DEFAULT_RANGES);
		},
	);

	it("accepts an explicit CIDR list from TRUST_PROXY_CIDRS", () => {
		expect(resolveTrustProxy({ TRUST_PROXY: "true", TRUST_PROXY_CIDRS: "192.0.2.0/24, 2001:db8::/32" })).toEqual([
			"192.0.2.0/24",
			"2001:db8::/32",
		]);
	});

	it("rejects invalid CIDR entries at startup", () => {
		expect(() => resolveTrustProxy({ TRUST_PROXY_CIDRS: "not-a-network" })).toThrow("Invalid TRUST_PROXY entry");
	});

	it("keeps an explicit off switch and multi-hop counts", () => {
		expect(resolveTrustProxy({ TRUST_PROXY: "false" })).toBe(false);
		expect(resolveTrustProxy({ TRUST_PROXY: "2" })).toBe(2);
	});
});

describe("X-Forwarded-For from an untrusted peer", () => {
	let server;
	let origin;

	beforeAll(async () => {
		app.get("/test-ip", (req, res) => res.json({ ip: req.ip }));
		server = app.listen(0, "127.0.0.1");
		await new Promise((resolve) => server.once("listening", resolve));
		origin = `http://127.0.0.1:${server.address().port}`;
	});
	afterAll(async () => {
		server?.closeAllConnections();
		if (server) await new Promise((resolve) => server.close(resolve));
	});

	it("ignores a forged header unless the peer matches the configured proxy ranges", async () => {
		app.set("trust proxy", resolveTrustProxy({ TRUST_PROXY_CIDRS: "192.0.2.0/24" }));
		const untrusted = await fetch(`${origin}/test-ip`, { headers: { "X-Forwarded-For": "198.51.100.7" } });
		expect((await untrusted.json()).ip).toMatch(/127\.0\.0\.1$/);

		app.set("trust proxy", ["loopback"]);
		const trusted = await fetch(`${origin}/test-ip`, { headers: { "X-Forwarded-For": "198.51.100.7" } });
		expect((await trusted.json()).ip).toBe("198.51.100.7");
	});
});
