import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	access: { can: vi.fn() },
	get: vi.fn(),
	update: vi.fn(),
	listStatus: vi.fn(),
	check: vi.fn(),
}));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = state.access;
		next();
	},
}));
vi.mock("../../internal/git-deploy.js", () => ({ default: {} }));
vi.mock("../../internal/proxy-host.js", () => ({ default: {} }));
vi.mock("../../internal/proxy-host-preview.js", () => ({ default: {} }));
vi.mock("../../internal/proxy-host-diagnostics.js", () => ({ default: {} }));
vi.mock("../../internal/proxy-host-monitor.js", () => ({
	default: { get: state.get, update: state.update, listStatus: state.listStatus, check: state.check },
}));

import router from "../../routes/nginx/proxy_hosts.js";
import { getCompiledSchema } from "../../schema/index.js";

describe("protected proxy-host monitor routes", () => {
	let server;
	let origin;
	beforeAll(async () => {
		await getCompiledSchema();
		const app = express();
		app.use(express.json());
		app.use("/nginx/proxy-hosts", router);
		app.use((err, _req, res, _next) => res.status(err.status ?? 500).json({ error: err.message }));
		server = await new Promise((resolve) => {
			const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
		});
		origin = `http://127.0.0.1:${server.address().port}`;
	});
	beforeEach(() => {
		vi.clearAllMocks();
		state.get.mockResolvedValue({ config: null, status: null, history: [] });
		state.update.mockResolvedValue({ config: { enabled: true }, history: [] });
		state.listStatus.mockResolvedValue([]);
		state.check.mockResolvedValue({ state: "up" });
	});
	afterAll(async () => {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	});

	it("rejects invalid IDs and URL-like paths before entering the monitor service", async () => {
		const invalidId = await fetch(`${origin}/nginx/proxy-hosts/12oops/monitor`);
		expect(invalidId.status).toBe(400);
		expect(state.get).not.toHaveBeenCalled();
		const invalidConfig = await fetch(`${origin}/nginx/proxy-hosts/12/monitor`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				enabled: true,
				type: "http",
				path: "//169.254.169.254/latest",
				interval_seconds: 60,
				timeout_ms: 1000,
				expected_status: 200,
				alert_enabled: true,
			}),
		});
		expect(invalidConfig.status).toBe(400);
		expect(state.update).not.toHaveBeenCalled();
	});

	it("validates 100-ID batch limits and propagates permission denial on details", async () => {
		const tooMany = await fetch(
			`${origin}/nginx/proxy-hosts/monitors/status?ids=${Array.from({ length: 101 }, (_, i) => i + 1).join(",")}`,
		);
		expect(tooMany.status).toBe(400);
		expect(state.listStatus).not.toHaveBeenCalled();
		const valid = await fetch(`${origin}/nginx/proxy-hosts/monitors/status?ids=11,12`);
		expect(valid.status).toBe(200);
		expect(state.listStatus).toHaveBeenCalledWith(state.access, [11, 12]);
		const denied = new Error("Permission Denied");
		denied.status = 403;
		state.get.mockRejectedValueOnce(denied);
		expect((await fetch(`${origin}/nginx/proxy-hosts/11/monitor`)).status).toBe(403);
	});

	it("limits manual network checks to 10 per minute from one caller", async () => {
		for (let i = 0; i < 10; i++) {
			const response = await fetch(`${origin}/nginx/proxy-hosts/11/monitor/check`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{}",
			});
			expect(response.status).toBe(200);
		}
		const blocked = await fetch(`${origin}/nginx/proxy-hosts/11/monitor/check`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{}",
		});
		expect(blocked.status).toBe(429);
		expect(state.check).toHaveBeenCalledTimes(10);
	});
});
