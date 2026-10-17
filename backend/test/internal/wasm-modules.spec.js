import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ hosts: [], revisions: [] }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/nginx.js", () => ({ default: { withConfigurationLock: (action) => action() } }));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: () => ({ select: async () => state.hosts }) } }));
vi.mock("../../models/proxy_host_revision.js", () => ({
	default: { query: () => ({ select: async () => state.revisions }) },
}));
vi.mock("../../lib/encryption.js", () => ({
	encrypt: (value) => `sealed:${Buffer.from(value).toString("base64")}`,
	decrypt: (value) => Buffer.from(value.slice(7), "base64").toString(),
}));
const { default: modules, validateModuleBytes, moduleArtifact } = await import("../../internal/wasm-modules.js");
const { prepareWasmFilters, materializeWasmHost, redactWasmFilters, prepareHost, executeWasmPreflight } = await import(
	"../../internal/wasm.js"
);
const bytes = await fs.readFile(new URL("../../wasm/policy.wasm", import.meta.url));
const customBytes = await fs.readFile(new URL("../fixtures/custom-proxy-wasm.wasm", import.meta.url));
const access = { can: vi.fn().mockResolvedValue(true) };
let directory;
beforeEach(async () => {
	directory = await fs.mkdtemp(path.join(os.tmpdir(), "wasm-modules-"));
	vi.stubEnv("DATA_PATH", directory);
	state.hosts = [];
	state.revisions = [];
	access.can.mockReset().mockResolvedValue(true);
});
afterEach(async () => {
	vi.unstubAllEnvs();
	await fs.rm(directory, { recursive: true, force: true });
});

describe("uploaded Proxy-Wasm modules", () => {
	it("authorizes before reading or writing files", async () => {
		const denied = { can: vi.fn().mockRejectedValue(new Error("denied")) };
		await expect(modules.list(denied)).rejects.toThrow("denied");
		await expect(modules.upload(denied, bytes, { name: "test", filename: "test.wasm" })).rejects.toThrow("denied");
		await expect(modules.remove(denied, "a".repeat(64))).rejects.toThrow("denied");
		expect(await fs.readdir(directory)).toEqual([]);
	});
	it("rechecks administration after waiting for the Nginx configuration queue", async () => {
		access.can.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("revoked while waiting"));
		await expect(modules.upload(access, bytes, { name: "test", filename: "test.wasm" })).rejects.toThrow(
			"revoked while waiting",
		);
		expect(await fs.readdir(directory)).toEqual([]);
	});
	it("compiles bytecode and rejects invalid magic, oversize, and missing HTTP ABI", async () => {
		expect(await validateModuleBytes(bytes)).toMatchObject({ abi: "0.2.1" });
		await expect(validateModuleBytes(Buffer.from("not wasm"))).rejects.toThrow(/Wasm/);
		await expect(validateModuleBytes(Buffer.alloc(16 * 1024 * 1024 + 1))).rejects.toThrow(/16 MiB/);
		await expect(validateModuleBytes(Buffer.from("AGFzbQEAAAA=", "base64"))).rejects.toThrow(/Proxy-Wasm/);
		const foreign = Buffer.from(customBytes);
		foreign.write("bad", foreign.indexOf(Buffer.from("env")));
		await expect(validateModuleBytes(foreign)).rejects.toThrow(/host imports/);
	});
	it("publishes immutable private content addressed bytecode and a bounded catalog", async () => {
		const row = await modules.upload(access, bytes, { name: "Header policy", filename: "headers.wasm" });
		expect(row).toMatchObject({
			id: row.sha256,
			name: "Header policy",
			filename: "headers.wasm",
			size: bytes.length,
		});
		expect(row.id).toMatch(/^[a-f0-9]{64}$/);
		expect(await modules.list(access)).toEqual([row]);
		expect(await modules.get(access, row.id)).toEqual(row);
		const artifact = await moduleArtifact(row.id);
		expect(await fs.readFile(artifact.path)).toEqual(bytes);
		expect((await fs.stat(artifact.path)).mode & 0o777).toBe(0o600);
		await modules.upload(access, bytes, { name: "Duplicate", filename: "duplicate.wasm" });
		expect(await modules.list(access)).toEqual([row]);
		await expect(modules.upload(access, bytes, { name: "bad", filename: "../escape.wasm" })).rejects.toThrow();
	});
	it("rejects artifact tampering, final symlinks and unsafe catalog parent directories", async () => {
		const row = await modules.upload(access, bytes, { name: "test", filename: "test.wasm" });
		const artifact = await moduleArtifact(row.id);
		await fs.writeFile(artifact.path, "tampered");
		await expect(moduleArtifact(row.id)).rejects.toThrow(/artifact/);
		await fs.unlink(artifact.path);
		await fs.symlink(path.join(directory, "outside"), artifact.path);
		await expect(moduleArtifact(row.id)).rejects.toThrow();
		await fs.rm(path.join(directory, "wasm", "modules"), { recursive: true });
		await fs.mkdir(path.join(directory, "outside"));
		await fs.symlink(path.join(directory, "outside"), path.join(directory, "wasm", "modules"));
		await expect(modules.list(access)).rejects.toThrow(/Unsafe/);
	});
	it("encrypts module configuration and preserves omitted replacements only for the same stable module", async () => {
		const row = await modules.upload(access, bytes, { name: "test", filename: "test.wasm" });
		const filter = {
			id: "custom",
			kind: "module",
			enabled: true,
			failure_mode: "closed",
			config: { module_id: row.id, configuration: { API_KEY: "private-value", camelKey: true } },
		};
		const stored = await prepareWasmFilters([filter]);
		expect(JSON.stringify(stored)).not.toContain("private-value");
		const publicFilters = redactWasmFilters(stored);
		expect(publicFilters[0].config).toEqual({ module_id: row.id, has_configuration: true });
		const preserved = await prepareWasmFilters(publicFilters, stored);
		expect(preserved).toEqual(stored);
		const prepared = await materializeWasmHost({ id: 501, enabled: true, meta: { wasm_filters: stored } });
		const chain = JSON.parse(await fs.readFile(prepared.configuration_path, "utf8"));
		expect(chain.filters[0]).toMatchObject({ kind: "module", sha256: row.id, phase: "both" });
		expect(JSON.parse(Buffer.from(chain.filters[0].configuration, "base64").toString())).toEqual(
			filter.config.configuration,
		);
		await expect(
			prepareWasmFilters([{ ...filter, config: { module_id: "a".repeat(64), has_configuration: true } }], stored),
		).rejects.toThrow();
		await expect(
			prepareWasmFilters([
				{ ...filter, config: { module_id: row.id, configuration: { large: "a".repeat(65536) } } },
			]),
		).rejects.toThrow(/64 KiB/);
	});
	it("guards host, revision and retained worker-chain references before catalog deletion", async () => {
		const row = await modules.upload(access, bytes, { name: "test", filename: "test.wasm" });
		const reference = { meta: { wasm_filters: [{ kind: "module", config: { module_id: row.id } }] } };
		state.hosts = [reference];
		await expect(modules.remove(access, row.id)).rejects.toThrow(/referenced/);
		state.hosts = [];
		state.revisions = [
			{ encrypted_snapshot: `sealed:${Buffer.from(JSON.stringify({ host: reference })).toString("base64")}` },
		];
		await expect(modules.remove(access, row.id)).rejects.toThrow(/referenced/);
		state.revisions = [];
		const hosts = path.join(directory, "wasm", "hosts");
		await fs.mkdir(hosts);
		await fs.writeFile(
			path.join(hosts, `1-${"a".repeat(64)}.json`),
			JSON.stringify({ filters: [{ sha256: row.id }] }),
		);
		await expect(modules.remove(access, row.id)).rejects.toThrow(/referenced/);
		await fs.rm(hosts, { recursive: true });
		expect(await modules.remove(access, row.id)).toEqual({ deleted: true });
		expect(await modules.list(access)).toEqual([]);
		// Bytes remain immutable even after catalog removal, protecting unknown old workers.
		expect(await fs.readFile(path.join(directory, "wasm", "artifacts", `${row.id}.wasm`))).toEqual(bytes);
	});
});

describe.skipIf(!process.env.SHIELDPM_WASM_NGINX_BINARY)("actual uploaded Proxy-Wasm execution", () => {
	beforeEach(async () => {
		const configuration = path.join(directory, "global-nginx.conf");
		await fs.writeFile(configuration, "http {\nwasm_vm wasmtime;\n}\n");
		vi.stubEnv("SHIELDPM_NGINX_CONF", configuration);
	});
	it("loads an independently uploaded module and passes exact JSON through both real HTTP phases", async () => {
		const row = await modules.upload(access, customBytes, { name: "Own module", filename: "own-module.wasm" });
		const configuration = { OriginalKey: "json-from-user", nested: { MixedCase: true } };
		const filters = await prepareWasmFilters([
			{
				id: "own",
				kind: "module",
				enabled: true,
				failure_mode: "closed",
				config: { module_id: row.id, configuration },
			},
		]);
		const prepared = await prepareHost({ id: 601, enabled: true, meta: { wasm_filters: filters } });
		const result = await executeWasmPreflight(prepared);
		expect(result.runtime_error).toBeUndefined();
		expect(result.status).toBe(200);
		expect(result.body.trim()).toBe("SHIELDPM_WASM_OK:uploaded-module");
		expect(result.headers["x-custom-response"]).toBe(JSON.stringify(configuration));
		const body = `${"a".repeat(65536)}final-chunk`;
		const withBody = await executeWasmPreflight(prepared, {}, { requestBody: body });
		expect(withBody.runtime_error).toBeUndefined();
		expect(withBody.body.trim()).toBe("SHIELDPM_WASM_OK:final-chunk");
		expect(withBody.headers["x-custom-chunks"]).toBe("2");
		expect(withBody.headers["x-custom-final"]).toBe("1");
	}, 15000);
	it("accepts body-only HTTP filters and actually executes their request body callback", async () => {
		const bodyOnly = Buffer.from(customBytes);
		for (const name of ["proxy_on_request_headers", "proxy_on_response_headers"])
			bodyOnly.write(name.replace("proxy", "other"), bodyOnly.indexOf(Buffer.from(name)));
		const row = await modules.upload(access, bodyOnly, { name: "Body-only", filename: "body-only.wasm" });
		expect(row.callbacks).toEqual(["proxy_on_request_body", "proxy_on_response_body"]);
		const filters = await prepareWasmFilters([
			{
				id: "body",
				kind: "module",
				enabled: true,
				failure_mode: "closed",
				config: { module_id: row.id, configuration: {} },
			},
		]);
		const prepared = await prepareHost({ id: 603, enabled: true, meta: { wasm_filters: filters } });
		const result = await executeWasmPreflight(prepared, {}, { requestBody: "body-only-executed" });
		expect(result.runtime_error).toBeUndefined();
		expect(result.body.trim()).toBe("SHIELDPM_WASM_OK:body-only-executed");
	}, 15000);
	it.each([
		[{ trap: "request" }, "request_body"],
		[{ trap: true }, "response_body"],
	])(
		"rejects fail-open body callback traps for %j before host activation",
		async (configuration, phase) => {
			const row = await modules.upload(access, customBytes, { name: "Body trap", filename: "body-trap.wasm" });
			const filters = await prepareWasmFilters([
				{
					id: "bodytrap",
					kind: "module",
					enabled: true,
					failure_mode: "open",
					config: { module_id: row.id, configuration },
				},
			]);
			await expect(prepareHost({ id: 604, enabled: true, meta: { wasm_filters: filters } })).rejects.toThrow(
				`failed in ${phase}`,
			);
		},
		15000,
	);
	it("rejects a fail-open custom trap even behind an earlier local response and preserves the accepted bytes", async () => {
		const safe = await modules.upload(access, customBytes, { name: "Safe", filename: "safe.wasm" });
		const validFilters = await prepareWasmFilters([
			{
				id: "own",
				kind: "module",
				enabled: true,
				failure_mode: "closed",
				config: { module_id: safe.id, configuration: {} },
			},
		]);
		const accepted = await prepareHost({ id: 602, enabled: true, meta: { wasm_filters: validFilters } });
		const acceptedBytes = await fs.readFile(accepted.configuration_path);
		const trap = Buffer.from(
			"AGFzbQEAAAABHwZgAABgAX8Bf2ACf38AYAJ/fwF/YAF/AGADf39/AX8DCAcAAQIDAQQFBQMBAAEHqwEIBm1lbW9yeQIAF3Byb3h5X2FiaV92ZXJzaW9uXzBfMl8xAAAYcHJveHlfb25fbWVtb3J5X2FsbG9jYXRlAAEXcHJveHlfb25fY29udGV4dF9jcmVhdGUAAhJwcm94eV9vbl9jb25maWd1cmUAAw1wcm94eV9vbl9kb25lAAQPcHJveHlfb25fZGVsZXRlAAUYcHJveHlfb25fcmVxdWVzdF9oZWFkZXJzAAYKHgcCAAsFAEGAIAsCAAsEAEEBCwQAQQELAgALAwAACw==",
			"base64",
		);
		const bad = await modules.upload(access, trap, { name: "Trap", filename: "trap.wasm" });
		const filters = await prepareWasmFilters([
			{
				id: "early",
				kind: "local_response",
				enabled: true,
				failure_mode: "closed",
				config: { status: 200, body: "early exit" },
			},
			{
				id: "bad",
				kind: "module",
				enabled: true,
				failure_mode: "open",
				config: { module_id: bad.id, configuration: {} },
			},
		]);
		await expect(prepareHost({ id: 602, enabled: true, meta: { wasm_filters: filters } })).rejects.toThrow(
			/previous configuration retained/,
		);
		expect(await fs.readFile(accepted.configuration_path)).toEqual(acceptedBytes);
		expect((await executeWasmPreflight(accepted)).headers["x-custom-response"]).toBe("{}");
	}, 15000);
});
