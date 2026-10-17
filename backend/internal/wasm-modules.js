/** Administrator-trusted, content-addressed Proxy-Wasm module catalog. */
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Ajv } from "ajv";
import errs from "../lib/error.js";

export const MAX_MODULE_BYTES = 16 * 1024 * 1024;
const MAX_CATALOG_ITEMS = 512;
const root = () => path.resolve(process.env.DATA_PATH || "/data", "wasm");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const validMetadata = new Ajv({ strict: false }).compile({
	type: "object",
	additionalProperties: false,
	required: ["name", "filename"],
	properties: {
		name: { type: "string", minLength: 1, maxLength: 128, pattern: "^[^\\u0000-\\u001f\\u007f]+$" },
		filename: { type: "string", minLength: 6, maxLength: 128, pattern: "^[^/\\\\\\u0000-\\u001f\\u007f]+\\.wasm$" },
	},
});

export function moduleIdentifier(id) {
	if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id))
		throw new errs.ValidationError("Invalid Wasm module identifier");
	return id;
}

/** Refuse symlink directory components, including a substituted DATA_PATH. */
export async function wasmDirectory(directory) {
	const resolved = path.resolve(directory);
	const dataRoot = path.resolve(process.env.DATA_PATH || "/data");
	if (resolved !== root() && !resolved.startsWith(`${root()}${path.sep}`))
		throw new errs.ConfigurationError("Unsafe Wasm storage directory");
	await fs.mkdir(dataRoot, { recursive: true, mode: 0o700 });
	let current = path.parse(resolved).root;
	for (const component of resolved.slice(current.length).split(path.sep)) {
		current = path.join(current, component);
		try {
			await fs.mkdir(current, { mode: 0o700 });
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
		}
		const info = await fs.lstat(current);
		if (!info.isDirectory() || info.isSymbolicLink())
			throw new errs.ConfigurationError("Unsafe Wasm storage directory");
	}
	return resolved;
}

/** Read and validate one regular inode, never following a final symlink or blocking on a FIFO. */
export async function readWasmFile(filename, maximum = MAX_MODULE_BYTES) {
	await wasmDirectory(path.dirname(filename));
	const handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		const info = await handle.stat();
		if (!info.isFile() || info.nlink !== 1 || info.size > maximum)
			throw new errs.ConfigurationError("Unsafe Wasm artifact");
		const bytes = await handle.readFile();
		const after = await handle.stat();
		if (bytes.length !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs)
			throw new errs.ConfigurationError("Wasm artifact changed while reading");
		return bytes;
	} finally {
		await handle.close();
	}
}

/** Publish a private, complete immutable inode, checking concurrent publication without replacement. */
export async function writeWasmArtifact(filename, bytes) {
	await wasmDirectory(path.dirname(filename));
	try {
		if (!(await readWasmFile(filename)).equals(Buffer.from(bytes)))
			throw new errs.ConfigurationError("Immutable Wasm artifact changed");
		return;
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	const temporary = `${filename}.${randomUUID()}.tmp`;
	try {
		await fs.writeFile(temporary, bytes, { mode: 0o600, flag: "wx", flush: true });
		try {
			await fs.link(temporary, filename);
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
			if (!(await readWasmFile(filename)).equals(Buffer.from(bytes)))
				throw new errs.ConfigurationError("Immutable Wasm artifact changed");
		}
	} finally {
		await fs.rm(temporary, { force: true });
	}
	const directory = await fs.open(path.dirname(filename), "r");
	try {
		await directory.sync();
	} finally {
		await directory.close();
	}
}

/** Compile without instantiation: generic WASI programs and foreign host imports cannot become HTTP filters. */
export async function validateModuleBytes(bytes) {
	if (!Buffer.isBuffer(bytes) || bytes.length < 8) throw new errs.ValidationError("A binary Wasm module is required");
	if (bytes.length > MAX_MODULE_BYTES) throw new errs.ValidationError("Wasm modules must not exceed 16 MiB");
	if (!bytes.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])))
		throw new errs.ValidationError("Invalid Wasm binary header");
	let compiled;
	try {
		compiled = await WebAssembly.compile(new Uint8Array(bytes));
	} catch {
		throw new errs.ValidationError("The uploaded Wasm module cannot be compiled");
	}
	const imports = WebAssembly.Module.imports(compiled);
	if (
		imports.some(
			(entry) => entry.module !== "env" || entry.kind !== "function" || !/^proxy_[a-z0-9_]+$/.test(entry.name),
		)
	)
		throw new errs.ValidationError(
			"Only Proxy-Wasm host imports are supported; WASI programs cannot run as HTTP filters",
		);
	const exports = WebAssembly.Module.exports(compiled);
	const functions = new Set(exports.filter((entry) => entry.kind === "function").map((entry) => entry.name));
	const required = [
		"proxy_abi_version_0_2_1",
		"proxy_on_memory_allocate",
		"proxy_on_context_create",
		"proxy_on_configure",
		"proxy_on_done",
		"proxy_on_delete",
	];
	if (
		required.some((name) => !functions.has(name)) ||
		!exports.some((entry) => entry.kind === "memory" && entry.name === "memory") ||
		![
			"proxy_on_request_headers",
			"proxy_on_response_headers",
			"proxy_on_request_body",
			"proxy_on_response_body",
		].some((name) => functions.has(name))
	)
		throw new errs.ValidationError("A Proxy-Wasm ABI 0.2.1 module with an HTTP callback is required");
	return {
		abi: "0.2.1",
		callbacks: [
			"proxy_on_request_headers",
			"proxy_on_response_headers",
			"proxy_on_request_body",
			"proxy_on_response_body",
		].filter((name) => functions.has(name)),
	};
}

async function catalogEntry(id) {
	const identifier = moduleIdentifier(id);
	let row;
	try {
		row = JSON.parse((await readWasmFile(path.join(root(), "modules", `${identifier}.json`), 8192)).toString());
	} catch (error) {
		if (error.code === "ENOENT") throw new errs.ItemNotFoundError(identifier);
		throw error;
	}
	if (
		row.id !== identifier ||
		row.sha256 !== identifier ||
		row.abi !== "0.2.1" ||
		!Number.isSafeInteger(row.size) ||
		row.size < 8 ||
		row.size > MAX_MODULE_BYTES ||
		!validMetadata({ name: row.name, filename: row.filename }) ||
		!Array.isArray(row.callbacks)
	)
		throw new errs.ConfigurationError("Invalid Wasm module catalog entry");
	return row;
}

/** Resolve only a trusted catalog digest, checking the complete bytecode before rendering. */
export async function moduleArtifact(id) {
	const row = await catalogEntry(id);
	const filename = path.join(root(), "artifacts", `${row.sha256}.wasm`);
	const bytes = await readWasmFile(filename);
	if (digest(bytes) !== row.sha256 || bytes.length !== row.size)
		throw new errs.ConfigurationError("Wasm module artifact hash mismatch");
	return { ...row, path: filename };
}

const referencesModule = (host, id) =>
	(host.meta?.wasm_filters || []).some((filter) => filter.kind === "module" && filter.config?.module_id === id);
async function assertUnreferenced(id) {
	const [{ default: Host }, { default: Revision }, { decrypt }] = await Promise.all([
		import("../models/proxy_host.js"),
		import("../models/proxy_host_revision.js"),
		import("../lib/encryption.js"),
	]);
	if ((await Host.query().select("id", "meta")).some((host) => referencesModule(host, id)))
		throw new errs.ValidationError("The Wasm module is referenced by a host");
	for (const revision of await Revision.query().select("encrypted_snapshot")) {
		let snapshot;
		try {
			snapshot = JSON.parse(decrypt(revision.encrypted_snapshot));
		} catch {
			throw new errs.ConfigurationError("Cannot verify Wasm module revision references");
		}
		if (referencesModule(snapshot.host || {}, id))
			throw new errs.ValidationError("The Wasm module is referenced by a host revision");
	}
	await wasmDirectory(path.join(root(), "hosts"));
	for (const name of await fs.readdir(path.join(root(), "hosts"))) {
		if (!/^[1-9]\d*-[a-f0-9]{64}\.json$/.test(name)) continue;
		const chain = JSON.parse((await readWasmFile(path.join(root(), "hosts", name), 2 * 1024 * 1024)).toString());
		if (chain.filters?.some((filter) => filter.sha256 === id))
			throw new errs.ValidationError("The Wasm module is referenced by a retained Nginx worker configuration");
	}
}

const internalWasmModules = {
	/** Global catalog contains only administrator-trusted modules. @param {any} access */
	async list(access) {
		await access.can("proxy_hosts:list");
		await wasmDirectory(path.join(root(), "modules"));
		const names = (await fs.readdir(path.join(root(), "modules"))).filter((name) =>
			/^[a-f0-9]{64}\.json$/.test(name),
		);
		if (names.length > MAX_CATALOG_ITEMS) throw new errs.ConfigurationError("Wasm catalog capacity exceeded");
		const rows = await Promise.all(names.map((name) => catalogEntry(name.slice(0, -5))));
		return rows.sort((left, right) => left.name.localeCompare(right.name));
	},
	/** @param {any} access @param {string} id */
	async get(access, id) {
		await access.can("proxy_hosts:list");
		return catalogEntry(id);
	},
	/** Upload requires settings administration before bytes are parsed or compiled. @param {any} access @param {Buffer} bytes @param {any} metadata */
	async upload(access, bytes, metadata) {
		await access.can("settings:update");
		if (!validMetadata(metadata))
			throw new errs.ValidationError("A module name and plain .wasm filename are required");
		const checkedMetadata = /** @type {{ name: string, filename: string }} */ (metadata);
		const inspected = await validateModuleBytes(bytes);
		const id = digest(bytes);
		const { default: nginx } = await import("./nginx.js");
		return nginx.withConfigurationLock(async () => {
			await access.can("settings:update");
			try {
				return await catalogEntry(id);
			} catch (error) {
				if (!(error instanceof errs.ItemNotFoundError)) throw error;
			}
			await wasmDirectory(path.join(root(), "modules"));
			if (
				(await fs.readdir(path.join(root(), "modules"))).filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
					.length >= MAX_CATALOG_ITEMS
			)
				throw new errs.ValidationError("The Wasm module catalog is full");
			if (!checkedMetadata.name.trim()) throw new errs.ValidationError("A Wasm module name is required");
			const row = {
				id,
				sha256: id,
				name: checkedMetadata.name.trim(),
				filename: checkedMetadata.filename,
				size: bytes.length,
				...inspected,
				created_on: new Date().toISOString(),
			};
			await writeWasmArtifact(path.join(root(), "artifacts", `${id}.wasm`), bytes);
			await writeWasmArtifact(path.join(root(), "modules", `${id}.json`), JSON.stringify(row));
			const { default: audit } = await import("./audit-log.js");
			await audit.add(access, {
				action: "created",
				object_type: "setting",
				object_id: 0,
				meta: { setting_id: "wasm-modules", module_id: id, name: row.name, size: row.size },
			});
			return row;
		});
	},
	/** Remove catalog availability; retain immutable bytecode for unobservable old workers. @param {any} access @param {string} id */
	async remove(access, id) {
		await access.can("settings:update");
		const row = await catalogEntry(id);
		const { default: nginx } = await import("./nginx.js");
		return nginx.withConfigurationLock(async () => {
			await access.can("settings:update");
			await catalogEntry(row.id);
			await assertUnreferenced(row.id);
			await fs.unlink(path.join(root(), "modules", `${row.id}.json`));
			const { default: audit } = await import("./audit-log.js");
			await audit.add(access, {
				action: "deleted",
				object_type: "setting",
				object_id: 0,
				meta: { setting_id: "wasm-modules", module_id: row.id, name: row.name },
			});
			return { deleted: true };
		});
	},
};
export default internalWasmModules;
