import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ can: vi.fn().mockResolvedValue(true) }));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = access;
		next();
	},
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/nginx.js", () => ({ default: { withConfigurationLock: (action) => action() } }));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: () => ({ select: async () => [] }) } }));
vi.mock("../../models/proxy_host_revision.js", () => ({ default: { query: () => ({ select: async () => [] }) } }));

import router from "../../routes/nginx/wasm.js";

describe("unified Wasm artifact API with real compiler and WASI execution", () => {
	let server;
	let origin;
	let directory;
	beforeAll(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "wasm-artifact-api-"));
		vi.stubEnv("DATA_PATH", directory);
		const app = express();
		app.use(express.json());
		app.use("/api/nginx/wasm", router);
		app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
		server = await new Promise((resolve) => {
			const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
		});
		origin = `http://127.0.0.1:${server.address().port}/api/nginx/wasm`;
	});
	beforeEach(() => access.can.mockReset().mockResolvedValue(true));
	afterAll(async () => {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
		vi.unstubAllEnvs();
		await fs.rm(directory, { recursive: true, force: true });
	});
	it("checks administrator permission before parsing a malformed upload", async () => {
		access.can.mockRejectedValueOnce(Object.assign(new Error("admin required"), { status: 403 }));
		const response = await fetch(`${origin}/artifacts?name=Bad&filename=bad.wasm`, {
			method: "POST",
			headers: { "Content-Type": "application/wasm" },
			body: "invalid",
		});
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: "admin required" });
		expect(await fs.readdir(directory)).toEqual([]);
	});
	it("accepts both executable contracts through one endpoint and preserves the strict legacy catalog shapes", async () => {
		const accepted = [];
		for (const [fixture, runtime] of [
			["custom-proxy-wasm", "proxy-wasm"],
			["standalone-wasi", "wasi-preview1"],
		]) {
			const bytes = await fs.readFile(new URL(`../fixtures/${fixture}.wasm`, import.meta.url));
			const response = await fetch(`${origin}/artifacts?name=${fixture}&filename=${fixture}.wasm`, {
				method: "POST",
				headers: { "Content-Type": "application/wasm" },
				body: bytes,
			});
			expect(response.status).toBe(201);
			expect(response.headers.get("cache-control")).toBe("no-store");
			const row = await response.json();
			expect(row).toMatchObject({ runtime, artifact: { size: bytes.length, filename: `${fixture}.wasm` } });
			expect(row.artifact.id).toBe(row.artifact.sha256);
			expect(row.artifact.path).toBeUndefined();
			accepted.push(row);
		}
		expect(await (await fetch(`${origin}/artifacts`)).json()).toEqual(accepted);
		expect(await (await fetch(`${origin}/modules`)).json()).toEqual([accepted[0].artifact]);
		expect(await (await fetch(`${origin}/applications`)).json()).toEqual([accepted[1].artifact]);
		const response = await fetch(`${origin}/applications/${accepted[1].artifact.id}/run`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ stdin: "host-upload\n" }),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "failed",
			exit_code: 7,
			stdout: "application.wasm\nhost-upload\n",
		});
	});
	it("rejects unauthorized host catalog access without returning approved metadata", async () => {
		access.can.mockRejectedValueOnce(Object.assign(new Error("host list denied"), { status: 403 }));
		const response = await fetch(`${origin}/artifacts`);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: "host list denied" });
	});
});
