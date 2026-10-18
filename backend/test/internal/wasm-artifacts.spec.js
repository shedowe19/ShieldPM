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
vi.mock("../../lib/encryption.js", () => ({ decrypt: (value) => Buffer.from(value, "base64").toString() }));

import applications, { applicationArtifact } from "../../internal/wasi-applications.js";
import artifacts, { detectWasmRuntime } from "../../internal/wasm-artifacts.js";
import modules, { validateModuleBytes } from "../../internal/wasm-modules.js";
import errs from "../../lib/error.js";

const fixture = (name) => fs.readFile(new URL(`../fixtures/${name}.wasm`, import.meta.url));
const proxy = await fixture("custom-proxy-wasm");
const sdk = await fixture("custom-proxy-wasm-wasi");
const wasi = await fixture("standalone-wasi");
const metadata = { name: "Own artifact", filename: "own.wasm" };
const access = { can: vi.fn() };
let directory;

beforeEach(async () => {
	directory = await fs.mkdtemp(path.join(os.tmpdir(), "wasm-artifacts-"));
	vi.stubEnv("DATA_PATH", directory);
	access.can.mockReset().mockResolvedValue(true);
	state.hosts = [];
	state.revisions = [];
});
afterEach(async () => {
	vi.unstubAllEnvs();
	await fs.rm(directory, { recursive: true, force: true });
});

describe("automatic Wasm runtime detection and protected catalogs", () => {
	it("classifies actual independently compiled Proxy-Wasm, SDK-WASI and standalone binaries", async () => {
		expect(await detectWasmRuntime(proxy)).toBe("proxy-wasm");
		expect(await detectWasmRuntime(sdk)).toBe("proxy-wasm");
		expect(await detectWasmRuntime(wasi)).toBe("wasi-preview1");
		expect(await fs.readdir(directory)).toEqual([]);
	});
	it("routes the same host upload to each strict catalog and executes the actual uploaded command", async () => {
		const module = await artifacts.upload(access, proxy, metadata);
		const application = await artifacts.upload(access, wasi, { ...metadata, filename: "COMMAND.WASM" });
		expect(module).toMatchObject({ runtime: "proxy-wasm", artifact: { abi: "0.2.1" } });
		expect(application).toMatchObject({ runtime: "wasi-preview1", artifact: { runtime: "wasi-preview1" } });
		expect(await artifacts.list(access)).toEqual([module, application]);
		expect(await modules.list(access)).toEqual([module.artifact]);
		expect(await applications.list(access)).toEqual([application.artifact]);
		expect(await applications.run(access, application.artifact.id, { stdin: "automatic-upload\n" })).toMatchObject({
			status: "failed",
			exit_code: 7,
			stdout: "application.wasm\nautomatic-upload\n",
			stderr: "diagnostic\n",
		});
	});
	it("explains using the wrong legacy endpoint without accepting the incompatible runtime", async () => {
		await expect(modules.upload(access, wasi, metadata)).rejects.toThrow("standalone WASI Preview 1");
		await expect(applications.upload(access, proxy, metadata)).rejects.toThrow("Proxy-Wasm HTTP module");
		expect(await fs.readdir(directory)).toEqual([]);
	});
	it("keeps SDK-WASI imports subordinate to the complete Proxy-Wasm lifecycle and HTTP contract", async () => {
		const missing = Buffer.from(sdk);
		for (const name of [
			"proxy_on_request_headers",
			"proxy_on_response_headers",
			"proxy_on_request_body",
			"proxy_on_response_body",
		])
			missing.write(name.replace("proxy", "other"), missing.indexOf(Buffer.from(name)));
		await expect(detectWasmRuntime(missing)).rejects.toThrow("Unsupported Wasm contract");
		await expect(validateModuleBytes(missing)).rejects.toThrow("HTTP callback");
	});
	it("rejects unsupported core binaries, component binaries, foreign imports and incomplete commands", async () => {
		const foreign = Buffer.from(wasi);
		foreign.write("unknown_host_imports_1", foreign.indexOf(Buffer.from("wasi_snapshot_preview1")));
		const missingStart = Buffer.from(wasi);
		missingStart.write("_other", missingStart.indexOf(Buffer.from("_start")));
		for (const bytes of [
			foreign,
			missingStart,
			Buffer.from("AGFzbQEAAAA=", "base64"),
			Buffer.from([0, 97, 115, 109, 13, 0, 1, 0]),
			Buffer.from([0, 97, 115, 109, 1, 0, 0, 0, 255]),
		])
			await expect(artifacts.upload(access, bytes, metadata)).rejects.toBeInstanceOf(errs.ValidationError);
		expect(await fs.readdir(directory)).toEqual([]);
	});
	it("authorizes upload before metadata or bytecode inspection and list before accessing catalogs", async () => {
		const denied = { can: vi.fn().mockRejectedValue(new errs.PermissionError("denied")) };
		await expect(artifacts.upload(denied, null, null)).rejects.toThrow("denied");
		await expect(artifacts.list(denied)).rejects.toThrow("denied");
		expect(await fs.readdir(directory)).toEqual([]);
	});
	it.each([
		null,
		{},
		{ ...metadata, filename: "../own.wasm" },
		{ ...metadata, name: "  " },
		{ ...metadata, runtime: "proxy-wasm" },
	])("rejects invalid upload metadata before inspection: %#", async (input) => {
		await expect(artifacts.upload(access, proxy, input)).rejects.toThrow("name and plain .wasm");
		expect(await fs.readdir(directory)).toEqual([]);
	});
	it("limits body type and size without reading or publishing files", async () => {
		await expect(artifacts.upload(access, new Uint8Array(wasi), metadata)).rejects.toThrow("binary Wasm");
		await expect(artifacts.upload(access, Buffer.alloc(16 * 1024 * 1024 + 1), metadata)).rejects.toThrow("16 MiB");
		expect(await fs.readdir(directory)).toEqual([]);
	});
	it("grants host catalog metadata without granting independent application execution", async () => {
		const uploaded = await artifacts.upload(access, wasi, metadata);
		const hostEditor = {
			can: vi.fn(async (permission) => {
				if (permission !== "proxy_hosts:list") throw new errs.PermissionError("admin required");
			}),
		};
		expect(await artifacts.list(hostEditor)).toEqual([uploaded]);
		expect(await applications.listForHosts(hostEditor)).toEqual([uploaded.artifact]);
		await expect(applications.run(hostEditor, uploaded.artifact.id, {})).rejects.toThrow("admin required");
		await expect(applications.list(hostEditor)).rejects.toThrow("admin required");
	});
	it("resolves hash-verified host artifacts while keeping paths out of catalog responses", async () => {
		const uploaded = await artifacts.upload(access, wasi, metadata);
		const resolved = await applicationArtifact(uploaded.artifact.id);
		expect(await fs.readFile(resolved.path)).toEqual(wasi);
		expect(uploaded.artifact.path).toBeUndefined();
		const changed = Buffer.from(wasi);
		changed[changed.length - 1] ^= 1;
		await fs.writeFile(resolved.path, changed);
		await expect(applicationArtifact(uploaded.artifact.id)).rejects.toThrow("hash mismatch");
	});
	it("retains application catalog entries referenced by current hosts, revisions or old worker chains", async () => {
		const { artifact } = await artifacts.upload(access, wasi, metadata);
		const host = { meta: { wasm_filters: [{ kind: "application", config: { application_id: artifact.id } }] } };
		state.hosts = [host];
		await expect(applications.remove(access, artifact.id)).rejects.toThrow("referenced by a host");
		state.hosts = [];
		state.revisions = [{ encrypted_snapshot: Buffer.from(JSON.stringify({ host })).toString("base64") }];
		await expect(applications.remove(access, artifact.id)).rejects.toThrow("host revision");
		state.revisions = [];
		const chain = path.join(directory, "wasm", "hosts", `1-${"a".repeat(64)}.json`);
		await fs.mkdir(path.dirname(chain), { recursive: true });
		await fs.writeFile(chain, JSON.stringify({ filters: [{ kind: "application", sha256: artifact.id }] }));
		await expect(applications.remove(access, artifact.id)).rejects.toThrow("retained Nginx worker");
		await fs.unlink(chain);
		expect(await applications.remove(access, artifact.id)).toEqual({ deleted: true });
		expect(await artifacts.list(access)).toEqual([]);
		expect(await fs.readFile(path.join(directory, "wasm", "artifacts", `${artifact.id}.wasm`))).toEqual(wasi);
	});
	it("fails closed on unreadable revision references instead of discarding application availability", async () => {
		const { artifact } = await artifacts.upload(access, wasi, metadata);
		state.revisions = [{ encrypted_snapshot: "not valid JSON" }];
		await expect(applications.remove(access, artifact.id)).rejects.toThrow(
			"Cannot verify WASI application revision",
		);
		expect(await artifacts.list(access)).toHaveLength(1);
	});
});
