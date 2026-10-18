/** Administrator-owned standalone WASI Preview 1 command applications. */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Ajv } from "ajv";
import errs from "../lib/error.js";
import { runWasiApplication } from "../lib/wasi-runner.js";
import { inspectWasmModule } from "../lib/wasm-module-inspection.js";
import { isWasiPreview1Command, proxyWasmMetadata } from "../lib/wasm-runtime-contracts.js";
import runSchema from "../schema/components/wasi-run-input.json" with { type: "json" };
import {
	assertWasmArtifactUnreferenced,
	MAX_MODULE_BYTES,
	moduleIdentifier,
	readWasmFile,
	wasmDirectory,
	writeWasmArtifact,
} from "./wasm-modules.js";

const MAX_APPLICATIONS = 512;
const root = () => path.resolve(process.env.DATA_PATH || "/data", "wasm");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ajv = new Ajv({ strict: false });
const metadataSchema = {
	type: "object",
	additionalProperties: false,
	required: ["name", "filename"],
	properties: {
		name: { type: "string", minLength: 1, maxLength: 128, pattern: "^[^\\u0000-\\u001f\\u007f]+$" },
		filename: {
			type: "string",
			minLength: 6,
			maxLength: 128,
			pattern: "^[^/\\\\\\u0000-\\u001f\\u007f]+\\.[wW][aA][sS][mM]$",
		},
	},
};
const validMetadata = ajv.compile(metadataSchema);
const validRun = ajv.compile(runSchema);
let catalogTail = Promise.resolve();
/** @template T @param {() => Promise<T>} action @returns {Promise<T>} */
const withCatalogLock = (action) => {
	const result = catalogTail.then(action, action);
	catalogTail = result.then(
		() => {},
		() => {},
	);
	return result;
};
const catalogNames = async () => {
	const directory = await wasmDirectory(path.join(root(), "applications"));
	const names = (await fs.readdir(directory)).filter((name) => /^[a-f0-9]{64}\.json$/.test(name));
	if (names.length > MAX_APPLICATIONS)
		throw new errs.ConfigurationError("WASI application catalog capacity exceeded");
	return names;
};

/** Validate without retaining request values in validation diagnostics. */
export function validateWasiRunInput(input) {
	if (!validRun(input)) throw new errs.ValidationError("Invalid WASI application run request");
	const request =
		/** @type {{args?: string[], env?: {name: string, value: string}[], stdin?: string, timeout_ms?: number}} */ (
			input
		);
	const args = request.args ?? [];
	const env = request.env ?? [];
	const values = [...args, ...env.flatMap((entry) => [entry.name, entry.value])];
	if (
		args.some((value) => Buffer.byteLength(value) > 4096) ||
		env.some((entry) => Buffer.byteLength(entry.value) > 4096) ||
		values.reduce((total, value) => total + Buffer.byteLength(value) + 1, 0) > 65536 ||
		new Set(env.map((entry) => entry.name)).size !== env.length ||
		Buffer.byteLength(request.stdin ?? "") > 65536
	)
		throw new errs.ValidationError("WASI application input exceeds its limits");
	return { args, env, stdin: request.stdin ?? "", timeout_ms: request.timeout_ms ?? 10000 };
}

/** Inspect a WASI command without executing its module start function. */
export async function validateWasiApplication(bytes) {
	if (typeof bytes !== "object" || bytes === null || !Buffer.isBuffer(bytes))
		throw new errs.ValidationError("A binary Wasm application is required");
	if (bytes.length > MAX_MODULE_BYTES) throw new errs.ValidationError("Wasm applications must not exceed 16 MiB");
	if (bytes.length < 8 || !bytes.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])))
		throw new errs.ValidationError("Invalid Wasm application binary header");
	const inspection = await inspectWasmModule(bytes);
	if (!isWasiPreview1Command(inspection)) {
		if (proxyWasmMetadata(inspection))
			throw new errs.ValidationError(
				"This is a Proxy-Wasm HTTP module. Use the automatic Wasm upload in the host editor to attach it to HTTP traffic",
			);
		throw new errs.ValidationError("A standalone WASI Preview 1 command with memory and _start is required");
	}
}

async function catalogEntry(id) {
	const identifier = moduleIdentifier(id);
	let row;
	try {
		row = JSON.parse(
			(await readWasmFile(path.join(root(), "applications", `${identifier}.json`), 8192)).toString(),
		);
	} catch (error) {
		if (error.code === "ENOENT") throw new errs.ItemNotFoundError(identifier);
		throw new errs.ConfigurationError("Cannot read WASI application catalog entry");
	}
	if (
		!row ||
		row.id !== identifier ||
		row.sha256 !== identifier ||
		row.runtime !== "wasi-preview1" ||
		!validMetadata({ name: row.name, filename: row.filename }) ||
		!Number.isSafeInteger(row.size) ||
		row.size < 8 ||
		row.size > MAX_MODULE_BYTES ||
		typeof row.created_on !== "string"
	)
		throw new errs.ConfigurationError("Invalid WASI application catalog entry");
	return {
		id: identifier,
		sha256: identifier,
		name: row.name,
		filename: row.filename,
		size: row.size,
		runtime: "wasi-preview1",
		created_on: row.created_on,
	};
}

async function applicationBytes(id) {
	const row = await catalogEntry(id);
	const bytes = await readWasmFile(path.join(root(), "artifacts", `${row.sha256}.wasm`));
	if (hash(bytes) !== row.sha256 || bytes.length !== row.size)
		throw new errs.ConfigurationError("WASI application artifact hash mismatch");
	return { row, bytes };
}

/** Resolve a trusted application digest and verify immutable bytes before host activation.
 * @param {string} id
 */
export async function applicationArtifact(id) {
	const { row } = await applicationBytes(id);
	return { ...row, path: path.join(root(), "artifacts", `${row.sha256}.wasm`) };
}

const audit = async (access, action, row, extra = {}) => {
	const { default: internalAudit } = await import("./audit-log.js");
	await internalAudit.add(access, {
		action,
		object_type: "setting",
		object_id: 0,
		meta: { setting_id: "wasi-applications", application_id: row.id, name: row.name, ...extra },
	});
};

const listCatalog = async () => {
	const rows = await Promise.all((await catalogNames()).map((name) => catalogEntry(name.slice(0, -5))));
	return rows.sort((left, right) => left.name.localeCompare(right.name));
};

const applications = {
	/** Host editors may select administrator-approved applications without obtaining independent execution rights. @param {any} access */
	async listForHosts(access) {
		await access.can("proxy_hosts:list");
		return withCatalogLock(async () => {
			await access.can("proxy_hosts:list");
			return listCatalog();
		});
	},
	/** @param {any} access */
	async list(access) {
		await access.can("settings:update");
		return withCatalogLock(async () => {
			await access.can("settings:update");
			return listCatalog();
		});
	},
	/** @param {any} access @param {Buffer} bytes @param {any} metadata */
	async upload(access, bytes, metadata) {
		await access.can("settings:update");
		if (typeof bytes !== "object" || bytes === null || !Buffer.isBuffer(bytes))
			throw new errs.ValidationError("A binary Wasm application is required");
		if (!validMetadata(metadata))
			throw new errs.ValidationError("An application name and plain .wasm filename are required");
		const checked = /** @type {{name: string, filename: string}} */ (metadata);
		if (!checked.name.trim()) throw new errs.ValidationError("A WASI application name is required");
		await validateWasiApplication(bytes);
		const id = hash(bytes);
		return withCatalogLock(async () => {
			await access.can("settings:update");
			try {
				return await catalogEntry(id);
			} catch (error) {
				if (!(error instanceof errs.ItemNotFoundError)) throw error;
			}
			if ((await catalogNames()).length >= MAX_APPLICATIONS)
				throw new errs.ValidationError("The WASI application catalog is full");
			const row = {
				id,
				sha256: id,
				name: checked.name.trim(),
				filename: checked.filename,
				size: bytes.length,
				runtime: "wasi-preview1",
				created_on: new Date().toISOString(),
			};
			await writeWasmArtifact(path.join(root(), "artifacts", `${id}.wasm`), bytes);
			await writeWasmArtifact(path.join(root(), "applications", `${id}.json`), JSON.stringify(row));
			await audit(access, "created", row);
			return row;
		});
	},
	/** @param {any} access @param {string} id */
	async remove(access, id) {
		await access.can("settings:update");
		const { default: nginx } = await import("./nginx.js");
		// Host mutation already owns the Nginx lock before resolving catalog entries.
		// Keep this same order so deleting an application cannot race activation or deadlock.
		return nginx.withConfigurationLock(() =>
			withCatalogLock(async () => {
				await access.can("settings:update");
				const row = await catalogEntry(id);
				await assertWasmArtifactUnreferenced(row.id, "application");
				const filename = path.resolve(root(), "applications", `${row.id}.json`);
				if (!filename.startsWith(`${root()}${path.sep}`))
					throw new errs.ConfigurationError("Unsafe WASI application catalog path");
				await fs.unlink(filename);
				// Immutable bytecode is retained for already running applications or Proxy-Wasm workers.
				await audit(access, "deleted", row);
				return { deleted: true };
			}),
		);
	},
	/** @param {any} access @param {string} id @param {unknown} input @param {{signal?: AbortSignal}} [options] */
	async run(access, id, input, options = {}) {
		await access.can("settings:update");
		const request = validateWasiRunInput(input);
		const { row, bytes } = await withCatalogLock(async () => {
			await access.can("settings:update");
			return applicationBytes(id);
		});
		await audit(access, "updated", row, { operation: "run_requested" });
		const result = await runWasiApplication(bytes, request, options);
		await audit(access, "updated", row, {
			operation: "run_completed",
			status: result.status,
			exit_code: result.exit_code,
		});
		return result;
	},
};
export default applications;
