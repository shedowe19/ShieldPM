/** Fixed compile-only inspection process. Never instantiate uploaded code or provide it host imports. */
import { parentPort, workerData } from "node:worker_threads";

const MAX_BYTES = 16 * 1024 * 1024;
const MAX_DESCRIPTORS = 16384;

try {
	if (
		typeof workerData !== "object" ||
		workerData === null ||
		!(workerData instanceof Uint8Array) ||
		workerData.byteLength > MAX_BYTES
	) {
		parentPort?.postMessage({ ok: false });
	} else {
		// This is deliberate administrator-trusted Wasm inspection, not JavaScript evaluation.
		const compiled = await WebAssembly.compile(new Uint8Array(workerData));
		const imports = WebAssembly.Module.imports(compiled);
		const exports = WebAssembly.Module.exports(compiled);
		parentPort?.postMessage(
			imports.length + exports.length > MAX_DESCRIPTORS ? { ok: false } : { ok: true, imports, exports },
		);
	}
} catch {
	// Engine diagnostics may include module-controlled names. Return no diagnostic or bytecode content.
	parentPort?.postMessage({ ok: false });
} finally {
	parentPort?.close();
}
