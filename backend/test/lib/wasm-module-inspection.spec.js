import fs from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ mode: "real", workers: [], options: [] }));
vi.mock("node:worker_threads", async (original) => {
	const actual = await original();
	return {
		...actual,
		Worker: class extends actual.Worker {
			constructor(filename, options) {
				state.options.push({ filename, options });
				const scripts = {
					hang: "while (true) {}",
					empty: "export {};",
					crash: 'throw new Error("PRIVATE_MODULE_DIAGNOSTIC");',
					invalid:
						'import {parentPort} from "node:worker_threads";parentPort.postMessage({ok:true,imports:"PRIVATE_MODULE_DIAGNOSTIC",exports:[]});',
				};
				super(
					state.mode === "real"
						? filename
						: new URL(`data:text/javascript,${encodeURIComponent(scripts[state.mode])}`),
					options,
				);
				state.workers.push(this);
			}
		},
	};
});

import { inspectWasmModule } from "../../lib/wasm-module-inspection.js";

const fixture = await fs.readFile(new URL("../fixtures/custom-proxy-wasm.wasm", import.meta.url));
afterEach(async () => {
	await Promise.all(state.workers.splice(0).map((worker) => worker.terminate()));
	state.options = [];
	state.mode = "real";
	vi.useRealTimers();
});

describe("bounded compile-only Wasm inspection", () => {
	it("inspects an actual HTTP filter using a fixed worker without detaching or changing upload bytes", async () => {
		const before = Buffer.from(fixture);
		const result = await inspectWasmModule(fixture);
		expect(result.imports).toContainEqual({ module: "env", name: "proxy_get_configuration", kind: "function" });
		expect(result.exports).toContainEqual({ name: "proxy_on_request_body", kind: "function" });
		expect(fixture).toEqual(before);
		expect(state.workers[0].threadId).toBe(-1);
		expect(state.options[0].filename.pathname).toMatch(/\/lib\/wasm-module-inspection-worker\.js$/);
		expect(state.options[0].options).toMatchObject({
			execArgv: [],
			env: { NODE_OPTIONS: "" },
			resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
		});
	});
	it("does not execute a start function that would trap during instantiation", async () => {
		const startTrap = Buffer.from([
			0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 8, 1, 0, 10, 5, 1, 3, 0, 0, 11,
		]);
		await expect(WebAssembly.instantiate(startTrap)).rejects.toThrow(/unreachable/);
		await expect(inspectWasmModule(startTrap)).resolves.toEqual({ imports: [], exports: [] });
	});
	it("rejects malformed bytecode with no engine diagnostic or uploaded content", async () => {
		await expect(inspectWasmModule(Buffer.from("PRIVATE_MODULE_DIAGNOSTIC"))).rejects.toThrow(
			"The uploaded Wasm module cannot be compiled",
		);
	});
	it.each(["string", null, [], { length: 8 }])(
		"rejects nonbinary upload values before spawning: %j",
		async (bytes) => {
			await expect(inspectWasmModule(bytes)).rejects.toThrow("A binary Wasm module is required");
			expect(state.workers).toHaveLength(0);
		},
	);
	it("rejects oversized uploads before copying or spawning a worker", async () => {
		await expect(inspectWasmModule(Buffer.alloc(16 * 1024 * 1024 + 1))).rejects.toThrow("16 MiB");
		expect(state.workers).toHaveLength(0);
	});
	it.each([
		["empty", "Wasm module inspection returned no result"],
		["crash", "Wasm module inspection failed"],
		["invalid", "Wasm module inspection returned an invalid result"],
	])("rejects a real worker's %s outcome without leaking its data", async (mode, message) => {
		state.mode = mode;
		await expect(inspectWasmModule(fixture)).rejects.toThrow(message);
	});
	it("limits concurrent hung compiler threads, times them out, terminates them and accepts subsequent work", async () => {
		state.mode = "hang";
		vi.useFakeTimers();
		const first = inspectWasmModule(fixture);
		const second = inspectWasmModule(fixture);
		const failures = Promise.all([
			expect(first).rejects.toThrow("Wasm module inspection timed out"),
			expect(second).rejects.toThrow("Wasm module inspection timed out"),
		]);
		await expect(inspectWasmModule(fixture)).rejects.toThrow("busy");
		expect(state.workers).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(4999);
		expect(state.workers.every((worker) => worker.threadId !== -1)).toBe(true);
		await vi.advanceTimersByTimeAsync(1);
		await failures;
		vi.useRealTimers();
		await Promise.all(state.workers.map((worker) => worker.terminate()));
		await new Promise((resolve) => setImmediate(resolve));
		state.mode = "real";
		await expect(inspectWasmModule(fixture)).resolves.toMatchObject({ exports: expect.any(Array) });
	});
});
