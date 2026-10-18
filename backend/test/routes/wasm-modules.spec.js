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

import router from "../../routes/nginx/wasm.js";

describe("protected binary Wasm module API", () => {
	let directory;
	let server;
	let origin;
	beforeAll(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "wasm-module-api-"));
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
	it("accepts exact raw bytes and exposes only digest-addressed catalog metadata", async () => {
		const bytes = await fs.readFile(new URL("../fixtures/custom-proxy-wasm.wasm", import.meta.url));
		const response = await fetch(`${origin}/modules?name=Own%20module&filename=own.wasm`, {
			method: "POST",
			headers: { "Content-Type": "application/wasm" },
			body: bytes,
		});
		expect(response.status).toBe(201);
		const row = await response.json();
		expect(row).toMatchObject({ name: "Own module", filename: "own.wasm", size: bytes.length, abi: "0.2.1" });
		expect(row.id).toBe(row.sha256);
		expect(row.path).toBeUndefined();
		expect(await (await fetch(`${origin}/modules`)).json()).toEqual([row]);
		expect(await (await fetch(`${origin}/modules/${row.id}`)).json()).toEqual(row);
		expect((await fetch(`${origin}/modules/not-a-digest`)).status).toBe(400);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(access.can).toHaveBeenCalledWith("settings:update");
	});
	it("rejects non-administrators before bytecode parsing", async () => {
		const denied = Object.assign(new Error("denied"), { status: 403 });
		access.can.mockRejectedValueOnce(denied);
		const response = await fetch(`${origin}/modules?name=Bad&filename=bad.wasm`, {
			method: "POST",
			headers: { "Content-Type": "application/wasm" },
			body: "invalid bytecode",
		});
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: "denied" });
	});
	it("rejects oversized raw uploads before compilation or persistence", async () => {
		const response = await fetch(`${origin}/modules?name=Oversize&filename=large.wasm`, {
			method: "POST",
			headers: { "Content-Type": "application/wasm" },
			body: Buffer.alloc(16 * 1024 * 1024 + 1),
		});
		expect(response.status).toBe(413);
		const rows = await (await fetch(`${origin}/modules`)).json();
		expect(rows).toHaveLength(1);
	});
});
