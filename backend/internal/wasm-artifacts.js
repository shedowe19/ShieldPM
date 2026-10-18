/** Unified upload and host selection for the two distinct executable Wasm runtimes. */
import { Ajv } from "ajv";
import errs from "../lib/error.js";
import { inspectWasmModule } from "../lib/wasm-module-inspection.js";
import { isWasiPreview1Command, proxyWasmMetadata } from "../lib/wasm-runtime-contracts.js";
import metadataSchema from "../schema/components/wasm-upload-metadata.json" with { type: "json" };
import applications from "./wasi-applications.js";
import modules, { MAX_MODULE_BYTES } from "./wasm-modules.js";

const validMetadata = new Ajv({ strict: false }).compile(metadataSchema);

/** Detect only supported executable contracts without instantiating administrator bytecode.
 * @param {Buffer} bytes @returns {Promise<"proxy-wasm" | "wasi-preview1">}
 */
export async function detectWasmRuntime(bytes) {
	if (typeof bytes !== "object" || bytes === null || !Buffer.isBuffer(bytes))
		throw new errs.ValidationError("A binary Wasm module or application is required");
	if (bytes.length > MAX_MODULE_BYTES) throw new errs.ValidationError("Wasm artifacts must not exceed 16 MiB");
	if (bytes.length < 8 || !bytes.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])))
		throw new errs.ValidationError("A core Wasm binary is required; Wasm components are not supported");
	const inspection = await inspectWasmModule(bytes);
	// SDK modules may import WASI functions; the complete Proxy-Wasm contract takes precedence.
	if (proxyWasmMetadata(inspection)) return "proxy-wasm";
	if (isWasiPreview1Command(inspection)) return "wasi-preview1";
	throw new errs.ValidationError(
		"Unsupported Wasm contract. Upload a Proxy-Wasm ABI 0.2.1 HTTP module or a WASI Preview 1 command exporting memory and _start",
	);
}

const artifacts = {
	/** Host editors see only administrator-approved metadata; no independent run permission is granted. @param {any} access */
	async list(access) {
		await access.can("proxy_hosts:list");
		const proxyModules = await modules.list(access);
		const wasiApplications = await applications.listForHosts(access);
		return [
			...proxyModules.map((artifact) => ({ runtime: "proxy-wasm", artifact })),
			...wasiApplications.map((artifact) => ({ runtime: "wasi-preview1", artifact })),
		].sort(
			(left, right) =>
				left.artifact.name.localeCompare(right.artifact.name) || left.runtime.localeCompare(right.runtime),
		);
	},
	/** Upload into the detected runtime's existing immutable catalog. @param {any} access @param {Buffer} bytes @param {any} metadata */
	async upload(access, bytes, metadata) {
		await access.can("settings:update");
		if (!validMetadata(metadata))
			throw new errs.ValidationError("An artifact name and plain .wasm filename are required");
		const checked = /** @type {{name: string, filename: string}} */ (metadata);
		if (!checked.name.trim())
			throw new errs.ValidationError("An artifact name and plain .wasm filename are required");
		const runtime = await detectWasmRuntime(bytes);
		// The destination service independently revalidates bytecode, permissions and its serialized catalog.
		// Detection never creates a bypass of either runtime's strict upload contract.
		const artifact = await (runtime === "proxy-wasm" ? modules : applications).upload(access, bytes, checked);
		return { runtime, artifact };
	},
};
export default artifacts;
