import fs from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ children: [], options: [] }));
vi.mock("node:child_process", async (original) => {
	const actual = await original();
	return {
		...actual,
		fork: (filename, args, options) => {
			state.options.push({ filename, args, options });
			const child = actual.fork(filename, args, options);
			state.children.push(child);
			return child;
		},
	};
});

import { MAX_WASI_OUTPUT_BYTES, runWasiApplication } from "../../lib/wasi-runner.js";

const fixture = async (name = "standalone-wasi") => fs.readFile(new URL(`../fixtures/${name}.wasm`, import.meta.url));
const application = await fixture();
const infinite = await fixture("standalone-wasi-infinite");

afterEach(async () => {
	await Promise.all(
		state.children.splice(0).map(
			(child) =>
				new Promise((resolve) => {
					if (child.exitCode !== null || child.signalCode !== null) return resolve();
					child.once("close", resolve);
					child.kill("SIGKILL");
				}),
		),
	);
	state.options = [];
	vi.unstubAllEnvs();
});

describe("real standalone WASI Preview 1 commands", () => {
	it("executes independent bytecode with exact args, environment, stdin, stdout, stderr and nonzero guest exit", async () => {
		vi.stubEnv("SHIELDPM_WASI_PRIVATE_TEST_VALUE", "must-not-inherit");
		vi.stubEnv("NODE_OPTIONS", "--this-must-not-be-inherited");
		const before = Buffer.from(application);
		const result = await runWasiApplication(application, {
			args: ["first", "SecondCase"],
			env: [{ name: "TEST_KEY", value: "VALUE" }],
			stdin: "line input\n",
		});
		expect(result).toMatchObject({
			status: "failed",
			exit_code: 7,
			stdout: "application.wasm\nfirst\nSecondCase\nTEST_KEY=VALUE\nline input\n",
			stderr: "diagnostic\n",
			signal: null,
			truncated: false,
		});
		expect(result.duration_ms).toBeGreaterThanOrEqual(0);
		expect(application).toEqual(before);
		expect(state.options[0]).toMatchObject({
			args: [],
			options: { execPath: process.execPath, env: {}, serialization: "advanced" },
		});
		expect(state.options[0].filename.pathname).toMatch(/\/lib\/wasi-runner-child\.js$/);
		expect(state.options[0].options.execArgv).toContain("--wasm-max-mem-pages=4096");
		expect(state.options[0].options.execArgv).not.toContain("--eval");
	});
	it("supplies empty defaults and the full 64 KiB of standard input without blocking the API event loop", async () => {
		const result = await runWasiApplication(application, { stdin: "ü".repeat(32768) });
		expect(result).toMatchObject({ status: "failed", exit_code: 7, truncated: false });
		expect(result.stdout).toBe(`application.wasm\n${"ü".repeat(32768)}`);
	});
	it("preserves the full unsigned WASI exit code instead of truncating it to the OS exit status", async () => {
		expect(await runWasiApplication(await fixture("standalone-wasi-exit-code"))).toMatchObject({
			status: "failed",
			exit_code: 0xffffffff,
			signal: null,
		});
	});
	it("provides no inherited environment or preopened filesystem directory", async () => {
		vi.stubEnv("SHIELDPM_WASI_PRIVATE_TEST_VALUE", "must-not-inherit");
		expect(await runWasiApplication(await fixture("standalone-wasi-no-filesystem"))).toMatchObject({
			status: "completed",
			exit_code: 0,
			stdout: "",
			stderr: "",
		});
	});
	it("enforces the actual V8 256 MiB per-memory initial allocation and growth limit", async () => {
		expect(await runWasiApplication(await fixture("standalone-wasi-memory-limit"))).toMatchObject({
			status: "failed",
			exit_code: null,
		});
		expect(await runWasiApplication(await fixture("standalone-wasi-memory-growth"))).toMatchObject({
			status: "completed",
			exit_code: 0,
		});
	});
	it("contains an actual guest trap and returns no native diagnostic", async () => {
		expect(await runWasiApplication(await fixture("standalone-wasi-trap"))).toMatchObject({
			status: "failed",
			exit_code: null,
			stdout: "",
			stderr: "",
		});
	});
	it("kills an infinite Wasm loop at its deadline and releases the actual child before returning", async () => {
		const result = await runWasiApplication(infinite, { timeout_ms: 100 });
		expect(result).toMatchObject({ status: "timed_out", exit_code: null, signal: "SIGKILL" });
		expect(state.children[0].signalCode).toBe("SIGKILL");
		expect(result.duration_ms).toBeLessThan(3000);
		expect(await runWasiApplication(await fixture("standalone-wasi-memory-growth"))).toMatchObject({
			status: "completed",
		});
	});
	it("kills a real output flood and retains at most one MiB across both output streams", async () => {
		const result = await runWasiApplication(await fixture("standalone-wasi-output-limit"));
		expect(result).toMatchObject({ status: "output_limit", exit_code: null, truncated: true, signal: "SIGKILL" });
		const outputSize = Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr);
		expect(outputSize).toBeLessThanOrEqual(MAX_WASI_OUTPUT_BYTES);
		expect(outputSize).toBeGreaterThan(MAX_WASI_OUTPUT_BYTES - 6);
		expect(result.stdout).toMatch(/^�+$/);
		expect(result.stderr).toMatch(/^�+$/);
	});
	it("limits two actual running children, cancels both, and permits subsequent work", async () => {
		const firstController = new AbortController();
		const secondController = new AbortController();
		const first = runWasiApplication(infinite, {}, { signal: firstController.signal });
		const second = runWasiApplication(infinite, {}, { signal: secondController.signal });
		await expect(runWasiApplication(application)).rejects.toThrow("busy");
		expect(state.children).toHaveLength(2);
		firstController.abort();
		secondController.abort();
		for (const result of await Promise.all([first, second])) {
			expect(result).toMatchObject({ status: "cancelled", exit_code: null, signal: "SIGKILL" });
		}
		expect(await runWasiApplication(await fixture("standalone-wasi-memory-growth"))).toMatchObject({
			status: "completed",
		});
	});
	it("returns an already-cancelled request without creating a child", async () => {
		const controller = new AbortController();
		controller.abort();
		expect(await runWasiApplication(application, {}, { signal: controller.signal })).toMatchObject({
			status: "cancelled",
			exit_code: null,
			signal: null,
		});
		expect(state.children).toHaveLength(0);
	});
	it.each([
		{ args: Array(33).fill("argument") },
		{ args: ["x\0y"] },
		{ args: ["ü".repeat(2049)] },
		{ args: Array(17).fill("x".repeat(4096)) },
		{ args: Array(16).fill("x".repeat(4096)) },
		{ env: [{ name: "INVALID=NAME", value: "x" }] },
		{ env: [{ name: "KEY", value: "x\0y" }] },
		{ env: [{ name: "KEY", value: "x".repeat(4097) }] },
		{
			env: [
				{ name: "KEY", value: "a" },
				{ name: "KEY", value: "b" },
			],
		},
		{ stdin: "ü".repeat(32769) },
		{ timeout_ms: 99 },
		{ timeout_ms: 60001 },
		{ timeout_ms: 100.5 },
	])("rejects invalid execution input before starting any child: %#", async (input) => {
		await expect(runWasiApplication(application, input)).rejects.toThrow();
		expect(state.children).toHaveLength(0);
	});
	it("rejects oversized binaries before copying or spawning", async () => {
		await expect(runWasiApplication(Buffer.alloc(16 * 1024 * 1024 + 1))).rejects.toThrow("16 MiB");
		expect(state.children).toHaveLength(0);
	});
});
