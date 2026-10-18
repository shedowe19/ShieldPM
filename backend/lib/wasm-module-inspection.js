import { Worker } from "node:worker_threads";
import errs from "./error.js";

export const MAX_WASM_INSPECTION_BYTES = 16 * 1024 * 1024;
const INSPECTION_TIMEOUT_MS = 5000;
const MAX_ACTIVE_INSPECTIONS = 2;
const MAX_DESCRIPTORS = 16384;
let activeInspections = 0;

/** @typedef {{imports: WebAssembly.ModuleImportDescriptor[], exports: WebAssembly.ModuleExportDescriptor[]}} Inspection */

const validDescriptors = (entries, imports) =>
	Array.isArray(entries) &&
	entries.length <= MAX_DESCRIPTORS &&
	entries.every(
		(entry) =>
			entry &&
			typeof entry === "object" &&
			typeof entry.name === "string" &&
			["function", "global", "memory", "table", "tag"].includes(entry.kind) &&
			(!imports || typeof entry.module === "string"),
	);

/**
 * Compile administrator-supplied bytecode in a fixed, disposable worker, without instantiating it.
 * The deadline and worker count bound inspection work; V8 heap limits do not bound all native memory.
 * @param {unknown} bytes
 * @returns {Promise<Inspection>}
 */
export async function inspectWasmModule(bytes) {
	if (typeof bytes !== "object" || bytes === null || !Buffer.isBuffer(bytes))
		throw new errs.ValidationError("A binary Wasm module is required");
	if (bytes.byteLength > MAX_WASM_INSPECTION_BYTES)
		throw new errs.ValidationError("Wasm modules must not exceed 16 MiB");
	if (activeInspections >= MAX_ACTIVE_INSPECTIONS)
		throw new errs.ConfigurationError("Wasm module inspection is busy; retry shortly");
	activeInspections++;
	const deadline = Date.now() + INSPECTION_TIMEOUT_MS;
	return new Promise((resolve, reject) => {
		let worker;
		let timeout;
		let settled = false;
		const finish = async (error, result = undefined) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			// A timeout must reject without waiting for V8/native cancellation to complete.
			// Retain its concurrency slot until the thread has actually terminated.
			if (error) reject(error);
			try {
				await worker?.terminate();
			} catch {
				// The original bounded, sanitized failure remains authoritative.
			} finally {
				activeInspections--;
				worker?.removeAllListeners();
			}
			if (!error) resolve(result);
		};
		try {
			// Transfer a private copy: the caller still needs its original bytes for hashing/storage.
			const input = Uint8Array.from(bytes);
			worker = new Worker(new URL("./wasm-module-inspection-worker.js", import.meta.url), {
				workerData: input,
				transferList: [input.buffer],
				execArgv: [],
				// Do not inherit preload hooks, inspector flags, or heap overrides from NODE_OPTIONS.
				env: { NODE_OPTIONS: "" },
				resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
				stdout: true,
				stderr: true,
			});
			worker.stdout?.resume();
			worker.stderr?.resume();
			worker.on("error", () => void finish(new errs.ConfigurationError("Wasm module inspection failed")));
			worker.on(
				"exit",
				() => void finish(new errs.ConfigurationError("Wasm module inspection returned no result")),
			);
			worker.on("message", (message) => {
				if (message?.ok === false) {
					void finish(new errs.ValidationError("The uploaded Wasm module cannot be compiled"));
				} else if (
					message?.ok !== true ||
					!validDescriptors(message.imports, true) ||
					!validDescriptors(message.exports, false) ||
					message.imports.length + message.exports.length > MAX_DESCRIPTORS
				) {
					void finish(new errs.ConfigurationError("Wasm module inspection returned an invalid result"));
				} else {
					void finish(null, { imports: message.imports, exports: message.exports });
				}
			});
			timeout = setTimeout(
				() => void finish(new errs.ConfigurationError("Wasm module inspection timed out")),
				Math.max(0, deadline - Date.now()),
			);
			timeout.unref?.();
		} catch {
			void finish(new errs.ConfigurationError("Wasm module inspection could not start"));
		}
	});
}
