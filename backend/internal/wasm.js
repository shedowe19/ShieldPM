import * as childProcess from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import http2 from "node:http2";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv } from "ajv";
import errs from "../lib/error.js";
import { validateWasiHostSettings } from "../lib/wasi-http-contract.js";
import { redactWasmFilters } from "../lib/wasm-response.js";
import filterSchema from "../schema/components/wasm-filters.json" with { type: "json" };
import { applicationArtifact } from "./wasi-applications.js";
import { prepareWasiHostBridge } from "./wasi-host-bridge.js";
import { moduleArtifact } from "./wasm-modules.js";

const bundle = fileURLToPath(new URL("../wasm/", import.meta.url));
const dispatcher = fileURLToPath(new URL("../../rootfs/usr/local/share/lua/5.1/shieldpm/wasm.lua", import.meta.url));
const wasiDispatcher = fileURLToPath(
	new URL("../../rootfs/usr/local/share/lua/5.1/shieldpm/wasi.lua", import.meta.url),
);
const root = () => path.join(process.env.DATA_PATH || "/data", "wasm");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const validate = new Ajv({ allErrors: true, strict: false }).compile(filterSchema);
const forbidden = new Set([
	"host",
	"connection",
	"content-length",
	"transfer-encoding",
	"upgrade",
	"te", // HTTP TE field; codespell:ignore te
	"trailer",
	"keep-alive",
	"proxy-connection",
]);
let preflightQueue = Promise.resolve();
let capabilityInspection = null;
let capability = { available: false, state: "unverified", checked_at: null };

/** Validate the public filter contract without accepting stored ciphertext from callers. */
export function validateWasmFilters(filters) {
	if (!validate(filters)) throw new errs.ValidationError("Invalid Wasm filter configuration");
	const ids = new Set();
	const checked = /** @type {any[]} */ (filters);
	for (const filter of checked) {
		if (ids.has(filter.id)) throw new errs.ValidationError("Wasm filter identifiers must be unique");
		ids.add(filter.id);
		const config = filter.config;
		if (filter.kind === "application") {
			if (
				!config.application_id ||
				!["filter", "handler"].includes(config.mode) ||
				!["stdio", "http-json-v1"].includes(config.protocol) ||
				(config.mode === "filter" && config.protocol !== "http-json-v1") ||
				Object.keys(config).some(
					(key) => !["application_id", "mode", "protocol", "settings", "has_settings"].includes(key),
				)
			)
				throw new errs.ValidationError(
					"WASI host applications require a catalog application and HTTP execution mode",
				);
			if (config.settings !== undefined) validateWasiHostSettings(config.settings);
			continue;
		}
		if (["application_id", "mode", "protocol", "settings", "has_settings"].some((key) => config[key] !== undefined))
			throw new errs.ValidationError("WASI application settings are only valid for application filters");
		if (filter.kind === "module") {
			if (
				!config.module_id ||
				Object.keys(config).some((key) => !["module_id", "configuration", "has_configuration"].includes(key))
			)
				throw new errs.ValidationError("Module filters require a catalog module and JSON configuration");
			if (
				config.configuration !== undefined &&
				Buffer.byteLength(JSON.stringify(config.configuration), "utf8") > 65536
			)
				throw new errs.ValidationError("Wasm module configuration exceeds 64 KiB");
		} else if (
			config.module_id !== undefined ||
			config.configuration !== undefined ||
			config.has_configuration !== undefined
		) {
			throw new errs.ValidationError("Module configuration is only valid for module filters");
		} else if (filter.kind === "api_key") {
			if (
				filter.failure_mode !== "closed" ||
				!config.header ||
				config.operation ||
				config.status ||
				config.body !== undefined
			) {
				throw new errs.ValidationError("API-key filters require a header and fail-closed behavior");
			}
		} else if (filter.kind === "local_response") {
			if (
				!config.status ||
				config.body === undefined ||
				config.header ||
				config.value !== undefined ||
				config.operation
			) {
				throw new errs.ValidationError("Local-response filters require a status and body");
			}
		} else {
			if (
				!config.header ||
				!config.operation ||
				config.status ||
				config.body !== undefined ||
				config.has_secret !== undefined
			) {
				throw new errs.ValidationError("Header filters require a header and operation");
			}
			if (config.operation === "set" && config.value === undefined)
				throw new errs.ValidationError("Header value is required");
		}
		if (config.header && forbidden.has(config.header.toLowerCase()))
			throw new errs.ValidationError("Framing and routing headers cannot be changed by Wasm policies");
		if (Buffer.byteLength(config.value || config.body || "", "utf8") > 4096)
			throw new errs.ValidationError("Wasm value exceeds 4096 bytes");
	}
	const handlers = checked.filter(
		(filter) => filter.enabled && filter.kind === "application" && filter.config.mode === "handler",
	);
	if (handlers.length > 1)
		throw new errs.ValidationError("A host can have only one enabled WASI HTTP application handler");
	if (handlers.length) {
		const index = checked.indexOf(handlers[0]);
		if (checked.slice(index + 1).some((filter) => filter.enabled && filter.kind !== "response_header"))
			throw new errs.ValidationError("The WASI HTTP application handler must follow all request filters");
	}
	for (let index = 0; index < checked.length; index++) {
		const authentication = checked[index];
		if (!authentication.enabled || authentication.kind !== "api_key") continue;
		if (
			checked
				.slice(0, index)
				.some(
					(filter) =>
						filter.enabled &&
						(filter.kind === "module" ||
							filter.kind === "application" ||
							(filter.kind === "request_header" &&
								filter.config.header.toLowerCase() === authentication.config.header.toLowerCase())),
				)
		) {
			throw new errs.ValidationError(
				"Authentication must run before custom modules and transformations of its credential header",
			);
		}
	}
	return checked;
}

/** Encrypt write-only API keys, preserving omitted or blank replacements by stable filter ID. */
export async function prepareWasmFilters(input = [], previous = []) {
	const filters = structuredClone(validateWasmFilters(input));
	const { encrypt } = await import("../lib/encryption.js");
	for (const filter of filters) {
		if (filter.kind === "application") {
			await applicationArtifact(filter.config.application_id);
			const prior = previous.find(
				(entry) =>
					entry.id === filter.id &&
					entry.kind === "application" &&
					entry.config.application_id === filter.config.application_id,
			);
			if (filter.config.settings !== undefined)
				filter.config.sealed_settings = encrypt(
					JSON.stringify(validateWasiHostSettings(filter.config.settings)),
				);
			else if (prior?.config?.sealed_settings) filter.config.sealed_settings = prior.config.sealed_settings;
			else if (filter.config.has_settings)
				throw new errs.ValidationError("The WASI application settings must be supplied again");
			else filter.config.sealed_settings = encrypt(JSON.stringify(validateWasiHostSettings({})));
			delete filter.config.settings;
			delete filter.config.has_settings;
			continue;
		}
		if (filter.kind === "module") {
			await moduleArtifact(filter.config.module_id);
			const prior = previous.find(
				(entry) =>
					entry.id === filter.id &&
					entry.kind === "module" &&
					entry.config.module_id === filter.config.module_id,
			);
			if (filter.config.configuration !== undefined)
				filter.config.sealed_configuration = encrypt(JSON.stringify(filter.config.configuration));
			else if (prior?.config?.sealed_configuration)
				filter.config.sealed_configuration = prior.config.sealed_configuration;
			else if (filter.config.has_configuration)
				throw new errs.ValidationError("The module configuration must be supplied again");
			else filter.config.sealed_configuration = encrypt("{}");
			delete filter.config.configuration;
			delete filter.config.has_configuration;
			continue;
		}
		if (filter.kind !== "api_key") continue;
		const prior = previous.find((entry) => entry.id === filter.id && entry.kind === "api_key");
		if (filter.config.value) filter.config.sealed_value = encrypt(filter.config.value);
		else if (prior?.config?.sealed_value) filter.config.sealed_value = prior.config.sealed_value;
		else if (filter.enabled) throw new errs.ValidationError("An enabled API-key filter requires a key");
		delete filter.config.value;
		delete filter.config.has_secret;
	}
	return filters;
}

export { redactWasmFilters };

/** Stable, bounded binary configuration consumed by the bundled Wasm program. */
export function encodeWasmConfiguration(filter, key = "") {
	const operation = filter.config.operation;
	const kind = {
		api_key: 1,
		request_header: operation === "remove" ? 3 : 2,
		response_header: operation === "remove" ? 5 : 4,
		local_response: 6,
	}[filter.kind];
	const name = Buffer.from(filter.config.header || "");
	const value = Buffer.from(
		filter.kind === "api_key"
			? key
			: filter.kind === "local_response"
				? filter.config.body
				: filter.config.value || "",
	);
	const prefix = Buffer.alloc(16);
	prefix.writeUInt32LE(kind, 0);
	prefix.writeUInt32LE(name.length, 4);
	prefix.writeUInt32LE(value.length, 8);
	prefix.writeUInt32LE(filter.config.status || 0, 12);
	return Buffer.concat([prefix, name, value]).toString("base64");
}

async function immutableFile(filename, bytes) {
	await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
	try {
		if (!(await fs.readFile(filename)).equals(Buffer.from(bytes)))
			throw new errs.ConfigurationError("Immutable Wasm artifact changed");
		return;
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	const temporary = `${filename}.${randomUUID()}.tmp`;
	try {
		await fs.writeFile(temporary, bytes, { flag: "wx", mode: 0o600, flush: true });
		try {
			// Publish a complete inode without replacing any existing immutable reference.
			await fs.link(temporary, filename);
			const directory = await fs.open(path.dirname(filename), "r");
			try {
				await directory.sync();
			} finally {
				await directory.close();
			}
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
			if (!(await fs.readFile(filename)).equals(Buffer.from(bytes)))
				throw new errs.ConfigurationError("Immutable Wasm artifact changed");
		}
	} finally {
		await fs.rm(temporary, { force: true });
	}
}

/** Materialize a content-addressed filter chain; existing active files are never overwritten. */
export async function materializeWasmHost(host) {
	const filters = (host.meta?.wasm_filters || []).filter((filter) => filter.enabled);
	if (!filters.length || host.enabled === false || host.enabled === 0) return null;
	// Validate stored metadata too, with ciphertext removed before checking the public schema.
	validateWasmFilters(redactWasmFilters(filters));
	const manifest = JSON.parse(await fs.readFile(path.join(bundle, "manifest.json"), "utf8"));
	const bytes = await fs.readFile(path.join(bundle, manifest.file));
	if (digest(bytes) !== manifest.sha256) throw new errs.ConfigurationError("Bundled Wasm hash mismatch");
	const artifactPath = path.join(root(), "artifacts", `${manifest.sha256}.wasm`);
	await immutableFile(artifactPath, bytes);
	const luaBytes = await fs
		.readFile(process.env.SHIELDPM_WASM_DISPATCHER || dispatcher)
		.catch(async () => fs.readFile("/usr/local/share/lua/5.1/shieldpm/wasm.lua"));
	const luaPath = path.join(root(), "artifacts", `${digest(luaBytes)}.lua`);
	await immutableFile(luaPath, luaBytes);
	const hasApplications = filters.some((filter) => filter.kind === "application");
	let wasiRuntime;
	let wasiLuaPath;
	if (hasApplications) {
		wasiRuntime = await prepareWasiHostBridge();
		const wasiLuaBytes = await fs
			.readFile(wasiDispatcher)
			.catch(async () => fs.readFile("/usr/local/share/lua/5.1/shieldpm/wasi.lua"));
		wasiLuaPath = path.join(root(), "artifacts", `${digest(wasiLuaBytes)}.lua`);
		await immutableFile(wasiLuaPath, wasiLuaBytes);
	}
	const { decrypt } = await import("../lib/encryption.js");
	const entries = await Promise.all(
		filters.map(async (filter) => {
			if (filter.kind === "application") {
				const application = await applicationArtifact(filter.config.application_id);
				let settings;
				try {
					settings = validateWasiHostSettings(JSON.parse(decrypt(filter.config.sealed_settings)));
				} catch {
					throw new errs.ValidationError("The WASI application settings are unavailable");
				}
				return {
					id: filter.id,
					kind: "application",
					path: application.path,
					sha256: application.sha256,
					application_id: application.id,
					mode: filter.config.mode,
					protocol: filter.config.protocol,
					settings,
					phase: "request",
					authentication: false,
					failure_mode: filter.failure_mode,
				};
			}
			if (filter.kind === "module") {
				const module = await moduleArtifact(filter.config.module_id);
				let configuration;
				try {
					configuration = decrypt(filter.config.sealed_configuration);
					validateWasmFilters([
						{ ...filter, config: { module_id: module.id, configuration: JSON.parse(configuration) } },
					]);
				} catch {
					throw new errs.ValidationError("The Wasm module configuration is unavailable");
				}
				return {
					id: filter.id,
					kind: "module",
					path: module.path,
					sha256: module.sha256,
					phase: "both",
					callbacks: module.callbacks,
					authentication: false,
					failure_mode: filter.failure_mode,
					configuration: Buffer.from(configuration).toString("base64"),
				};
			}
			return {
				id: filter.id,
				kind: filter.kind,
				path: artifactPath,
				sha256: manifest.sha256,
				phase: filter.kind === "response_header" ? "response" : "request",
				authentication: filter.kind === "api_key",
				failure_mode: filter.failure_mode,
				configuration: encodeWasmConfiguration(
					filter,
					filter.kind === "api_key" ? decrypt(filter.config.sealed_value) : "",
				),
			};
		}),
	);
	// Private immutable names must not provide an offline oracle for low-entropy
	// write-only values: include their existing randomized server ciphertext.
	const policyVersion = digest(
		JSON.stringify({
			version: manifest.version,
			filters: entries,
			protected_configuration: filters.map(
				(filter) =>
					filter.config.sealed_configuration ||
					filter.config.sealed_value ||
					filter.config.sealed_settings ||
					"",
			),
		}),
	);
	const modules = entries
		.filter((filter) => filter.kind === "module")
		.map((filter) => ({ filter_id: filter.id, module_id: filter.sha256 }));
	const applications = entries
		.filter((filter) => filter.kind === "application")
		.map((filter) => ({ filter_id: filter.id, application_id: filter.sha256 }));
	for (const entry of entries.filter((filter) => filter.kind === "application"))
		entry.bridge_token = wasiRuntime.tokenFor(`${host.id}:${policyVersion}:${entry.id}`);
	const statusPath = path.join(root(), "status", `${host.id}-${policyVersion}.json`);
	const activeVersion = hasApplications
		? modules.length
			? "Proxy-Wasm 0.2.1 + WASI Preview 1"
			: "WASI Preview 1"
		: modules.length
			? "Proxy-Wasm 0.2.1"
			: manifest.version;
	const activeHash = modules.length || hasApplications ? policyVersion : manifest.sha256;
	await fs.mkdir(path.dirname(statusPath), { recursive: true, mode: 0o700 });
	const contents = JSON.stringify({
		version: 1,
		bundle_version: manifest.version,
		active_version: activeVersion,
		active_sha256: activeHash,
		modules,
		applications,
		...(hasApplications
			? {
					host_id: host.id,
					policy_version: policyVersion,
					wasi_socket_path: wasiRuntime.socket_path,
					wasi_dispatcher_path: wasiLuaPath,
				}
			: {}),
		filters: entries,
		status_path: statusPath,
	});
	const configurationPath = path.join(root(), "hosts", `${host.id}-${digest(contents)}.json`);
	await immutableFile(configurationPath, contents);
	return {
		configuration_path: configurationPath,
		configuration_name: path.basename(configurationPath),
		dispatcher_path: luaPath,
		version: activeVersion,
		sha256: activeHash,
		modules,
		applications,
		...(hasApplications
			? {
					preflight_timeout_ms:
						Math.max(
							...entries
								.filter((entry) => entry.kind === "application")
								.map((entry) => entry.settings.timeout_ms),
						) + 2000,
				}
			: {}),
		filter_count: entries.length,
		status_path: statusPath,
	};
}

const quote = (value) => JSON.stringify(value);
const luaPath = () =>
	process.env.SHIELDPM_WASM_LUA_PATH || "/usr/local/share/lua/5.1/?.lua;/usr/local/share/lua/5.1/?/init.lua;;";
const nginxBinary = () => process.env.SHIELDPM_WASM_NGINX_BINARY || "nginx";

function requestSocket(socketPath, headers = {}, requestBody = "", options = {}) {
	return new Promise((resolve, reject) => {
		if (options.http2 && typeof socketPath === "number") {
			const session = http2.connect(`http://127.0.0.1:${socketPath}`);
			let request;
			let settled = false;
			const finish = (error, result) => {
				if (settled) return;
				settled = true;
				request?.destroy();
				session.destroy();
				if (error) reject(error.cause?.code === "ECONNREFUSED" ? error.cause : error);
				else resolve(result);
			};
			session.on("error", (error) => finish(error));
			session.setTimeout(options.timeoutMs || 1500, () =>
				finish(new errs.ConfigurationError("Wasm execution timed out")),
			);
			request = session.request({ ":path": "/", ":method": requestBody ? "POST" : "GET", ...headers });
			let responseHeaders;
			let body = "";
			request.on("response", (received) => {
				responseHeaders = received;
			});
			request.on("data", (chunk) => {
				if (body.length < 8192) body += chunk;
			});
			request.on("error", (error) => finish(error));
			request.on("aborted", () => finish(new errs.ConfigurationError("Wasm execution was interrupted")));
			request.on("end", () =>
				finish(null, {
					status: responseHeaders?.[":status"],
					headers: responseHeaders,
					body,
				}),
			);
			request.end(requestBody);
			return;
		}
		const target = typeof socketPath === "number" ? { host: "127.0.0.1", port: socketPath } : { socketPath };
		const framing = requestBody
			? options.chunked
				? { "Transfer-Encoding": "chunked" }
				: { "Content-Length": Buffer.byteLength(requestBody) }
			: {};
		const request = http.request(
			{
				...target,
				path: "/",
				method: requestBody ? "POST" : "GET",
				headers: { ...framing, ...headers },
				timeout: options.timeoutMs || 1500,
			},
			(response) => {
				let body = "";
				response.on("data", (chunk) => {
					if (body.length < 8192) body += chunk;
				});
				response.on("error", reject);
				response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
			},
		);
		request.on("error", reject);
		request.on("timeout", () => request.destroy(new errs.ConfigurationError("Wasm execution timed out")));
		request.end(requestBody);
	});
}

/** Execute the exact chain in an isolated, bounded Nginx child before production activation. */
export function executeWasmPreflight(prepared, headers = {}, options = {}) {
	const operation = preflightQueue.then(async () => {
		const work = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-wasm-"));
		/** @type {string | number} */
		let socketPath = path.join(work, "probe.sock");
		if (process.env.SHIELDPM_WASM_PREFLIGHT_TCP === "1" || options.http2) {
			socketPath = await new Promise((resolve, reject) => {
				const server = net.createServer();
				server.once("error", reject);
				server.listen(0, "127.0.0.1", () => {
					const port = /** @type {import("node:net").AddressInfo} */ (server.address()).port;
					server.close(() => resolve(port));
				});
			});
		}
		const listener = typeof socketPath === "number" ? `127.0.0.1:${socketPath}` : `unix:${socketPath}`;
		const configPath = path.join(work, "nginx.conf");
		// A candidate preflight must never mutate an accepted worker's runtime status.
		const probeChain = JSON.parse(await fs.readFile(prepared.configuration_path, "utf8"));
		if (probeChain.wasi_socket_path)
			probeChain.wasi_configuration_name = path.basename(prepared.configuration_path);
		if (options.filterId)
			probeChain.filters = probeChain.filters.filter((filter) => filter.id === options.filterId);
		probeChain.status_path = path.join(work, "status.json");
		const probeConfiguration = path.join(work, "chain.json");
		await fs.writeFile(probeConfiguration, JSON.stringify(probeChain), { mode: 0o600 });
		const timeoutMs = options.timeoutMs || prepared.preflight_timeout_ms || 1500;
		const needsProxyWasm = probeChain.filters.some((filter) => filter.kind !== "application");
		const config = `user root; daemon off; master_process off; worker_processes 1; pid ${work}/pid; error_log ${work}/error.log warn;
	events { worker_connections 32; } http { access_log off; ${needsProxyWasm ? "wasm_vm wasmtime;" : ""} lua_package_path ${quote(luaPath())}; ${process.env.SHIELDPM_WASM_LUA_CPATH ? `lua_package_cpath ${quote(process.env.SHIELDPM_WASM_LUA_CPATH)};` : ""}
	init_by_lua_block { shieldpm_wasm = dofile(${quote(prepared.dispatcher_path)}); shieldpm_wasm.load(${quote(probeConfiguration)}); }
	server { listen ${listener}; ${options.http2 ? "http2 on;" : ""} client_body_temp_path ${work}/body; location / { lua_check_client_abort on; access_by_lua_block { shieldpm_wasm.access(${quote(probeConfiguration)}); }
	header_filter_by_lua_block { shieldpm_wasm.header_filter(${quote(probeConfiguration)}); }
	body_filter_by_lua_block { shieldpm_wasm.body_filter(); } content_by_lua_block { ngx.say("SHIELDPM_WASM_OK:" .. (ngx.var.http_x_shieldpm_probe or "")); } } } }`;
		await fs.mkdir(path.join(work, "logs"));
		await fs.writeFile(configPath, config, { mode: 0o600 });
		const child = childProcess.spawn(nginxBinary(), ["-p", `${work}/`, "-c", configPath], { stdio: "ignore" });
		let spawnError;
		child.on("error", (error) => {
			spawnError = error;
		});
		const timer = setTimeout(() => child.kill("SIGKILL"), Math.max(5000, timeoutMs + 2000));
		try {
			for (let attempt = 0; attempt < 50; attempt++) {
				if (spawnError || child.exitCode !== null)
					throw new errs.ConfigurationError("Wasm runtime failed its execution preflight");
				try {
					const result = await requestSocket(socketPath, headers, options.requestBody || "", {
						...options,
						timeoutMs,
					});
					const runtimeError = await fs.readFile(probeChain.status_path, "utf8").catch((error) => {
						if (error.code === "ENOENT") return null;
						throw error;
					});
					return runtimeError ? { ...result, runtime_error: JSON.parse(runtimeError) } : result;
				} catch (error) {
					if (error.code !== "ENOENT" && error.code !== "ECONNREFUSED") throw error;
					await new Promise((resolve) => setTimeout(resolve, 50));
				}
			}
			throw new errs.ConfigurationError("Wasm runtime did not become ready");
		} finally {
			clearTimeout(timer);
			child.kill("SIGKILL");
			await new Promise((resolve) =>
				child.exitCode !== null || spawnError ? resolve(undefined) : child.once("close", resolve),
			);
			await fs.rm(work, { recursive: true, force: true });
		}
	});
	preflightQueue = operation.catch(() => {});
	return operation;
}

/** Prepare a host for rendering. A failed preflight leaves the old referenced chain untouched. */
export async function prepareHost(host) {
	if (
		host.enabled !== false &&
		host.enabled !== 0 &&
		host.meta?.wasm_filters?.some((filter) => filter.enabled && filter.kind !== "application")
	) {
		if (!(await capabilities()).configured)
			throw new errs.ConfigurationError(
				"The installed Nginx Wasm runtime is not configured; restart ShieldPM before activating filters",
			);
	}
	const prepared = await materializeWasmHost(host);
	if (!prepared) return null;
	const { decrypt } = await import("../lib/encryption.js");
	const filters = host.meta.wasm_filters.filter((filter) => filter.enabled);
	const headers = Object.fromEntries(
		filters
			.filter((filter) => filter.kind === "api_key")
			.map((filter) => [filter.config.header, decrypt(filter.config.sealed_value)]),
	);
	try {
		for (const filter of filters.filter((entry) => entry.kind === "module" || entry.kind === "application")) {
			for (const requestBody of ["", "shieldpm-wasm-preflight"]) {
				const probe = await executeWasmPreflight(prepared, headers, { filterId: filter.id, requestBody });
				if (probe.runtime_error)
					throw new errs.ConfigurationError(
						`${filter.kind === "application" ? "WASI application" : "Wasm module"} ${filter.id} failed in ${probe.runtime_error.phase}; verify its HTTP execution contract; previous configuration retained`,
					);
			}
		}
		const result = await executeWasmPreflight(prepared, headers);
		if (result.runtime_error) throw new errs.ConfigurationError("Wasm filter chain failed its execution preflight");
		const localResponse = filters.find((filter) => filter.kind === "local_response");
		const authenticationIndex = filters.findIndex((filter) => filter.kind === "api_key");
		const localIndex = filters.findIndex((filter) => filter.kind === "local_response");
		if (authenticationIndex >= 0 && (localIndex < 0 || authenticationIndex < localIndex)) {
			const denied = await executeWasmPreflight(prepared);
			if (denied.runtime_error || denied.status !== 401)
				throw new errs.ConfigurationError("Wasm authentication preflight did not reject missing credentials");
		}
		// Custom modules can intentionally transform or reject the probe. A completed
		// HTTP exchange without an ABI/configuration/trap error proves execution;
		// their business-specific response cannot be compared with bundled presets.
		if (filters.some((filter) => filter.kind === "module" || filter.kind === "application")) {
			const bodyProbe = await executeWasmPreflight(prepared, headers, { requestBody: "shieldpm-wasm-preflight" });
			if (bodyProbe.runtime_error)
				throw new errs.ConfigurationError("Wasm filter chain failed its body execution preflight");
			return prepared;
		}

		if (
			result.status !== (localResponse?.config.status || 200) ||
			(localResponse
				? result.body !== ([204, 304].includes(localResponse.config.status) ? "" : localResponse.config.body)
				: !result.body.startsWith("SHIELDPM_WASM_OK:"))
		)
			throw new errs.ConfigurationError("Wasm filter chain failed its execution preflight");
		return prepared;
	} catch (error) {
		if (error instanceof errs.ConfigurationError && /^(?:Wasm module|WASI application) /.test(error.message))
			throw error;
		throw new errs.ConfigurationError("Wasm execution preflight failed; previous configuration retained", error);
	}
}

/** Admin-visible capability includes a real bundled filter execution, never just nginx -t. */
export async function selfTest() {
	const key = randomUUID();
	const { encrypt } = await import("../lib/encryption.js");
	const host = {
		id: `selftest-${randomUUID()}`,
		enabled: true,
		meta: {
			wasm_filters: [
				{
					id: "authentication",
					kind: "api_key",
					enabled: true,
					failure_mode: "closed",
					config: { header: "x-shieldpm-api-key", sealed_value: encrypt(key) },
				},
				{
					id: "request",
					kind: "request_header",
					enabled: true,
					failure_mode: "closed",
					config: { header: "x-shieldpm-probe", value: "verified", operation: "set" },
				},
				{
					id: "response",
					kind: "response_header",
					enabled: true,
					failure_mode: "closed",
					config: { header: "x-shieldpm-wasm", value: "verified", operation: "set" },
				},
			],
		},
	};
	const prepared = await materializeWasmHost(host);
	try {
		const denied = await executeWasmPreflight(prepared);
		const wrong = await executeWasmPreflight(prepared, { "x-shieldpm-api-key": `${key}-wrong` });
		const result = await executeWasmPreflight(prepared, {
			"x-shieldpm-api-key": key,
			"x-shieldpm-probe": "spoofed",
		});
		if (
			denied.status !== 401 ||
			wrong.status !== 401 ||
			result.status !== 200 ||
			result.body.trim() !== "SHIELDPM_WASM_OK:verified" ||
			result.headers["x-shieldpm-wasm"] !== "verified"
		)
			throw new errs.ConfigurationError("Wasm capability self-test failed");
		capability = {
			available: true,
			state: "functional",
			version: prepared.version,
			sha256: prepared.sha256,
			module: "api7/wasm-nginx-module",
			abi: "0.2.1",
			checked_at: new Date().toISOString(),
		};
		capabilityInspection = null;
		return await capabilities();
	} catch (error) {
		capability = { available: false, state: "error", checked_at: new Date().toISOString() };
		throw error;
	} finally {
		await fs.unlink(prepared.configuration_path).catch(() => {});
	}
}

export async function getHostStatus(hostId) {
	try {
		const filename = `host-${Number(hostId)}.json`;
		let pointer;
		try {
			pointer = JSON.parse(await fs.readFile(path.join(root(), "active", filename), "utf8"));
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
			pointer = JSON.parse(await fs.readFile(path.join(root(), "status", filename), "utf8"));
		}
		const { configuration_file: _configuration, runtime_status_file: runtimeStatus, ...status } = pointer;
		if (status.state === "active" && /^[1-9]\d*-[a-f0-9]{64}\.json$/.test(runtimeStatus || "")) {
			const failure = await fs.readFile(path.join(root(), "status", runtimeStatus), "utf8").catch((error) => {
				if (error.code === "ENOENT") return null;
				throw error;
			});
			if (failure) {
				const details = JSON.parse(failure);
				const failedAt =
					typeof details.checked_at === "number" ? details.checked_at * 1000 : Date.parse(details.checked_at);
				if (!Number.isFinite(failedAt) || failedAt >= Date.parse(status.checked_at))
					return { ...status, ...details, version: status.version, sha256: status.sha256 };
			}
		}
		return status;
	} catch {
		return { state: "inactive", checked_at: null };
	}
}

/** Inspect capability without spawning a VM on every UI refresh. Run self-test for functional proof. */
export async function capabilities() {
	const manifest = JSON.parse(await fs.readFile(path.join(bundle, "manifest.json"), "utf8"));
	if (!capabilityInspection || capabilityInspection.expires < Date.now()) {
		let built = false;
		let nginxVersion = null;
		try {
			const result = await new Promise((resolve, reject) =>
				childProcess.execFile(
					nginxBinary(),
					["-V"],
					{ timeout: 2000, maxBuffer: 128 * 1024 },
					(error, stdout, stderr) => (error ? reject(error) : resolve({ stdout, stderr })),
				),
			);
			const output = `${result.stdout} ${result.stderr}`;
			built = /--add-(?:dynamic-)?module=\S*wasm-nginx-module/.test(output);
			nginxVersion = output.match(/nginx version: [^/]+\/([^\s]+)/)?.[1] || null;
		} catch {}
		const helper = luaPath()
			.split(";")
			.filter((entry) => entry.includes("?"))
			.map((entry) => entry.replace("?", "resty/proxy-wasm"));
		const exists = async (filename) =>
			fs.access(filename).then(
				() => true,
				() => false,
			);
		const installed =
			built &&
			(await exists(process.env.SHIELDPM_WASM_LIBRARY || "/usr/local/lib/libwasmtime.so")) &&
			(await Promise.all(helper.map(exists))).some(Boolean);
		const configurations = [
			process.env.SHIELDPM_NGINX_CONF || "/usr/local/nginx/conf/nginx.conf",
			path.join(process.env.DATA_PATH || "/data", "custom_nginx/http_top.conf"),
		];
		const configured = (
			await Promise.all(
				configurations.map(async (filename) => {
					try {
						return /^[ \t]*wasm_vm[ \t]+wasmtime[ \t]*;/m.test(await fs.readFile(filename, "utf8"));
					} catch {
						return false;
					}
				}),
			)
		).some(Boolean);
		let buildInfo = "";
		try {
			buildInfo = await fs.readFile(
				process.env.SHIELDPM_NGINX_BUILD_INFO || "/usr/local/nginx/build-info/sources.txt",
				"utf8",
			);
		} catch {}
		const moduleVersion = buildInfo.match(/^WN_VER=([^\r\n]+)$/m)?.[1] || null;
		const runtimeVersion = buildInfo.match(/^WASMTIME_VER=([^\r\n]+)$/m)?.[1] || null;
		capabilityInspection = {
			built,
			installed,
			configured,
			nginx_version: nginxVersion,
			module_version: moduleVersion,
			runtime_version: runtimeVersion,
			expires: Date.now() + 30_000,
		};
	}
	const { expires: _expires, ...inspection } = capabilityInspection;
	return {
		...capability,
		...inspection,
		version: manifest.version,
		sha256: manifest.sha256,
		module: "api7/wasm-nginx-module",
		abi: manifest.abi,
		trusted_only: true,
		custom_modules: true,
		wasi_host_applications: true,
		wasi_host_protocols: ["stdio", "http-json-v1"],
		wasi_host_body_max_bytes: 65536,
		module_upload_max_bytes: 16 * 1024 * 1024,
	};
}

export default {
	capabilities,
	prepareHost,
	prepareWasmFilters,
	redactWasmFilters,
	selfTest,
	getHostStatus,
	markHostActive,
};

/** Record activation only after the complete Nginx reload has succeeded. */
export async function markHostActive(hostId, prepared, activationError = null) {
	const statusPath = path.join(root(), "active", `host-${Number(hostId)}.json`);
	await fs.mkdir(path.dirname(statusPath), { recursive: true, mode: 0o700 });
	if (prepared && !activationError) {
		const runtimeName = path.basename(prepared.status_path);
		if (/^[1-9]\d*-[a-f0-9]{64}\.json$/.test(runtimeName))
			await fs.unlink(path.join(root(), "status", runtimeName)).catch((error) => {
				if (error.code !== "ENOENT") throw error;
			});
	}
	const temporary = `${statusPath}.${randomUUID()}.tmp`;
	try {
		await fs.writeFile(
			temporary,
			JSON.stringify(
				prepared
					? {
							state: activationError ? "error" : "active",
							...(activationError ? { message: activationError } : {}),
							checked_at: new Date().toISOString(),
							version: prepared.version,
							sha256: prepared.sha256,
							filter_count: prepared.filter_count,
							...(prepared.modules?.length ? { modules: prepared.modules } : {}),
							...(prepared.applications?.length ? { applications: prepared.applications } : {}),
							configuration_file: path.basename(prepared.configuration_path),
							runtime_status_file: path.basename(prepared.status_path),
						}
					: { state: "inactive", checked_at: new Date().toISOString() },
			),
			{ mode: 0o600, flag: "wx", flush: true },
		);
		await fs.rename(temporary, statusPath);
		const directory = await fs.open(path.dirname(statusPath), "r");
		try {
			await directory.sync();
		} finally {
			await directory.close();
		}
	} finally {
		await fs.rm(temporary, { force: true });
	}
}
