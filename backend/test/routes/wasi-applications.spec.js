import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ can: vi.fn().mockResolvedValue(true), audit: vi.fn(), children: [] }));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = { can: state.can };
		next();
	},
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: state.audit } }));
vi.mock("node:child_process", async (original) => {
	const actual = await original();
	return {
		...actual,
		fork: (...args) => {
			const child = actual.fork(...args);
			state.children.push(child);
			return child;
		},
	};
});

import router from "../../routes/nginx/wasm.js";

const fixture = (name = "standalone-wasi") => fs.readFile(new URL(`../fixtures/${name}.wasm`, import.meta.url));
describe("standalone WASI HTTP API with real execution", () => {
	let server;
	let origin;
	let directory;
	beforeAll(async () => {
		const app = express();
		app.use(express.json({ limit: "1mb" }));
		app.use("/api/nginx/wasm", router);
		app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
		server = await new Promise((resolve) => {
			const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
		});
		origin = `http://127.0.0.1:${server.address().port}/api/nginx/wasm/applications`;
	});
	beforeEach(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "wasi-http-api-"));
		vi.stubEnv("DATA_PATH", directory);
		state.can.mockReset().mockResolvedValue(true);
		state.audit.mockReset().mockResolvedValue(undefined);
		state.children = [];
	});
	afterEach(async () => {
		await Promise.all(
			state.children.map(
				(child) =>
					new Promise((resolve) => {
						if (child.exitCode !== null || child.signalCode !== null) return resolve();
						child.once("close", resolve);
						child.kill("SIGKILL");
					}),
			),
		);
		vi.unstubAllEnvs();
		await fs.rm(directory, { recursive: true, force: true });
	});
	afterAll(async () => {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	});
	const upload = async (name = "standalone-wasi") => {
		const response = await fetch(`${origin}?name=Own%20application&filename=own.wasm`, {
			method: "POST",
			headers: { "Content-Type": "application/wasm" },
			body: await fixture(name),
		});
		expect(response.status).toBe(201);
		return response.json();
	};
	const run = (id, data, signal = undefined) =>
		fetch(`${origin}/${id}/run`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
			signal,
		});
	it("uploads, executes and deletes a command without exposing paths or persisting execution secrets", async () => {
		const row = await upload();
		expect(row).toMatchObject({ runtime: "wasi-preview1", filename: "own.wasm", id: row.sha256 });
		expect(row.path).toBeUndefined();
		expect(await (await fetch(origin)).json()).toEqual([row]);
		const response = await run(row.id, {
			args: ["first", "SecondCase"],
			env: [{ name: "API_KEY", value: "guest-private-value" }],
			stdin: "input to guest\n",
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.json()).toMatchObject({
			status: "failed",
			exit_code: 7,
			stdout: "application.wasm\nfirst\nSecondCase\nAPI_KEY=guest-private-value\ninput to guest\n",
			stderr: "diagnostic\n",
			truncated: false,
		});
		const audit = JSON.stringify(state.audit.mock.calls);
		expect(audit).not.toContain("guest-private-value");
		expect(audit).not.toContain("input to guest");
		expect(audit).not.toContain("diagnostic");
		expect(audit).toContain("run_completed");
		expect((await fetch(`${origin}/${row.id}`, { method: "DELETE" })).status).toBe(200);
		expect(await (await fetch(origin)).json()).toEqual([]);
		expect(await fs.readFile(path.join(directory, "wasm", "artifacts", `${row.id}.wasm`))).toEqual(await fixture());
	});
	it("authorizes every operation and rejects upload before parsing or starting execution", async () => {
		state.can.mockRejectedValue(Object.assign(new Error("denied"), { status: 403 }));
		for (const response of [
			await fetch(origin),
			await fetch(`${origin}?name=Denied&filename=denied.wasm`, {
				method: "POST",
				headers: { "Content-Type": "application/wasm" },
				body: "not a module",
			}),
			await run("a".repeat(64), {}),
			await fetch(`${origin}/${"a".repeat(64)}`, { method: "DELETE" }),
		])
			expect(response.status).toBe(403);
		expect(state.children).toHaveLength(0);
		expect(state.audit).not.toHaveBeenCalled();
		expect(await fs.readdir(directory)).toEqual([]);
	});
	it("rejects oversized bytecode before compiling or publishing", async () => {
		const response = await fetch(`${origin}?name=Large&filename=large.wasm`, {
			method: "POST",
			headers: { "Content-Type": "application/wasm" },
			body: Buffer.alloc(16 * 1024 * 1024 + 1),
		});
		expect(response.status).toBe(413);
		expect(state.children).toHaveLength(0);
		expect(await fs.readdir(directory)).toEqual([]);
	});
	it("rejects invalid IDs and request inputs without creating a child or audit record", async () => {
		for (const input of [
			{ args: ["x\0y"] },
			{ env: [{ name: "PRIVATE_KEY", value: 17 }] },
			{ stdin: "ü".repeat(32769) },
			{ unexpected: "value" },
		]) {
			expect((await run("a".repeat(64), input)).status).toBe(400);
		}
		expect((await run("../outside", {})).status).toBe(404);
		expect((await run("not-a-digest", {})).status).toBe(400);
		expect(state.children).toHaveLength(0);
		expect(state.audit).not.toHaveBeenCalled();
	});
	it("compiles an endless command without running upload code, then enforces the run deadline", async () => {
		const row = await upload("standalone-wasi-infinite");
		expect(state.children).toHaveLength(0);
		const response = await run(row.id, { timeout_ms: 100 });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ status: "timed_out", signal: "SIGKILL", exit_code: null });
		expect(state.children[0].signalCode).toBe("SIGKILL");
	});
	it("kills actual guest execution when the HTTP client disconnects", async () => {
		const row = await upload("standalone-wasi-infinite");
		const controller = new AbortController();
		const pending = run(row.id, { timeout_ms: 60000 }, controller.signal).catch((error) => error);
		await vi.waitFor(() => expect(state.children).toHaveLength(1));
		controller.abort();
		expect((await pending).name).toBe("AbortError");
		await vi.waitFor(() => expect(state.children[0].signalCode).toBe("SIGKILL"));
		await vi.waitFor(() => expect(JSON.stringify(state.audit.mock.calls)).toContain("cancelled"));
	}, 5000);
});
