import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../lib/encryption.js", () => ({
	// Exercise the write-only boundary with randomized ciphertext; cryptographic primitives have their own tests.
	encrypt: (value) => `sealed:${randomUUID()}:${Buffer.from(value).toString("base64")}`,
	decrypt: (value) => Buffer.from(value.split(":").slice(2).join(":"), "base64").toString(),
}));

import applications from "../../internal/wasi-applications.js";
import { stopWasiHostBridges } from "../../internal/wasi-host-bridge.js";
import {
	getHostStatus,
	markHostActive,
	materializeWasmHost,
	prepareWasmFilters,
	redactWasmFilters,
	validateWasmFilters,
} from "../../internal/wasm.js";
import { decrypt } from "../../lib/encryption.js";
import { validateWasiHostSettings } from "../../lib/wasi-http-contract.js";

const fixture = await fs.readFile(new URL("../fixtures/standalone-wasi.wasm", import.meta.url));
const replacementFixture = await fs.readFile(new URL("../fixtures/standalone-wasi-exit-code.wasm", import.meta.url));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const access = { can: vi.fn().mockResolvedValue(true) };
const application = (config = {}) => ({
	id: "application",
	kind: "application",
	enabled: true,
	failure_mode: "closed",
	config: { application_id: digest(fixture), mode: "handler", protocol: "stdio", ...config },
});
const header = (id = "response") => ({
	id,
	kind: "response_header",
	enabled: true,
	failure_mode: "closed",
	config: { header: "x-policy", operation: "set", value: "after-application" },
});
const host = (filters) => ({ id: 741, enabled: true, meta: { wasm_filters: filters } });
let directory;

beforeEach(async () => {
	directory = await fs.mkdtemp(path.join(os.tmpdir(), "wasm-host-application-"));
	vi.stubEnv("DATA_PATH", directory);
	// These are storage/host-contract checks; loopback avoids environments that prohibit AF_UNIX.
	vi.stubEnv("SHIELDPM_WASM_PREFLIGHT_TCP", "1");
});
afterEach(async () => {
	await stopWasiHostBridges();
	vi.unstubAllEnvs();
	await fs.rm(directory, { recursive: true, force: true });
});
const upload = (bytes = fixture) =>
	applications.upload(access, bytes, { name: "Host command", filename: "command.wasm" });

describe("WASI application host contracts and write-only settings", () => {
	it("accepts a JSON-aware request filter and terminal stdio handler with later response policies", () => {
		const filters = [
			{ ...application({ mode: "filter", protocol: "http-json-v1" }), id: "transform" },
			application(),
			header(),
		];
		expect(validateWasmFilters(filters)).toEqual(filters);
		expect(() => validateWasmFilters([application({ mode: "filter", protocol: "stdio" })])).toThrow(
			/HTTP execution mode/,
		);
		const disabled = { ...application(), id: "disabled", enabled: false };
		expect(validateWasmFilters([application(), disabled, header()])).toHaveLength(3);
	});
	it("prevents handler bypass of request policies and requires credential verification before guest code", () => {
		const authenticate = {
			id: "auth",
			kind: "api_key",
			enabled: true,
			failure_mode: "closed",
			config: { header: "x-key", value: "credential" },
		};
		expect(validateWasmFilters([authenticate, application(), header()])).toHaveLength(3);
		expect(() =>
			validateWasmFilters([application({ mode: "filter", protocol: "http-json-v1" }), authenticate]),
		).toThrow(/Authentication must run before/);
		expect(() => validateWasmFilters([application(), { ...application(), id: "second" }])).toThrow(
			/only one enabled/,
		);
		expect(() =>
			validateWasmFilters([
				application(),
				{
					id: "request",
					kind: "request_header",
					enabled: true,
					failure_mode: "closed",
					config: { header: "x-request", operation: "set", value: "late" },
				},
			]),
		).toThrow(/follow all request filters/);
		expect(() =>
			validateWasmFilters([
				application(),
				{ ...application({ mode: "filter", protocol: "http-json-v1" }), id: "late-filter" },
			]),
		).toThrow(/follow all request filters/);
	});
	it.each([
		{ sealed_settings: "caller-ciphertext" },
		{ module_id: "a".repeat(64) },
		{ configuration: { foreign: true } },
		{ settings: { stdin: "caller-provided-request" } },
		{ settings: { preopens: { "/": "/" } } },
		{ settings: { execArgv: ["--eval"] } },
		{ settings: { env: [{ name: "SHIELDPM_HTTP_METHOD", value: "OVERRIDE" }] } },
		{
			settings: {
				env: [
					{ name: "KEY", value: "one" },
					{ name: "KEY", value: "two" },
				],
			},
		},
		{ settings: { env: [{ name: "KEY", value: "value", inherited: true }] } },
		{ settings: { args: ["nul\0value"] } },
		{ settings: { timeout_ms: 60001 } },
	])("rejects public host capability/ciphertext or execution-setting injection: %#", (config) => {
		expect(() => validateWasmFilters([application(config)])).toThrow();
	});
	it("rejects application fields smuggled into other policy kinds and unknown outer fields", () => {
		expect(() =>
			validateWasmFilters([{ ...header(), config: { ...header().config, application_id: digest(fixture) } }]),
		).toThrow(/only valid for application/);
		expect(() => validateWasmFilters([{ ...application(), arguments: [] }])).toThrow(/Invalid Wasm/);
		expect(() => validateWasmFilters([application({ protocol: "guess-json" })])).toThrow();
	});
	it("enforces the 64 KiB UTF-8 metadata budget including argument and environment separators", () => {
		const exactArgs = Array(16).fill("x".repeat(4095));
		expect(validateWasiHostSettings({ args: exactArgs }).args).toEqual(exactArgs);
		expect(() =>
			validateWasmFilters([application({ settings: { args: [...exactArgs.slice(0, 15), "x".repeat(4096)] } })]),
		).toThrow(/64 KiB/);
		const args = Array(15).fill("x".repeat(4096));
		const env = [{ name: "KEY", value: "v".repeat(4076) }];
		expect(validateWasiHostSettings({ args, env })).toMatchObject({ args, env, timeout_ms: 10000 });
		expect(() => validateWasiHostSettings({ args, env: [{ ...env[0], name: "KEY1" }] })).toThrow(/64 KiB/);
		expect(() => validateWasmFilters([application({ settings: { args: ["ü".repeat(2049)] } })])).toThrow();
	});
	it("stores encrypted normalized settings, redacts every secret, preserves omitted input and explicitly resets with an empty object", async () => {
		await upload();
		const settings = {
			args: ["private-argument"],
			env: [{ name: "PrivateKey", value: "private-value" }],
			timeout_ms: 2300,
		};
		const stored = await prepareWasmFilters([application({ settings })]);
		expect(stored[0].config.settings).toBeUndefined();
		expect(JSON.parse(decrypt(stored[0].config.sealed_settings))).toEqual(settings);
		for (const value of ["private-argument", "private-value", "PrivateKey"])
			expect(JSON.stringify(stored)).not.toContain(value);
		const publicFilters = redactWasmFilters(stored);
		expect(publicFilters[0].config).toEqual({
			application_id: digest(fixture),
			mode: "handler",
			protocol: "stdio",
			has_settings: true,
		});
		const retained = await prepareWasmFilters(publicFilters, stored);
		expect(retained).toEqual(stored);
		const reset = await prepareWasmFilters([application({ settings: {} })], stored);
		expect(JSON.parse(decrypt(reset[0].config.sealed_settings))).toEqual({ args: [], env: [], timeout_ms: 10000 });
		expect(reset[0].config.sealed_settings).not.toBe(stored[0].config.sealed_settings);
	});
	it("requires settings again when the stable filter ID or catalog application changes", async () => {
		await upload();
		const replacement = await upload(replacementFixture);
		const stored = await prepareWasmFilters([application({ settings: { args: ["private-argument"] } })]);
		const [publicFilter] = redactWasmFilters(stored);
		await expect(
			prepareWasmFilters(
				[{ ...publicFilter, config: { ...publicFilter.config, application_id: replacement.id } }],
				stored,
			),
		).rejects.toThrow(/supplied again/);
		await expect(prepareWasmFilters([{ ...publicFilter, id: "replacement" }], stored)).rejects.toThrow(
			/supplied again/,
		);
		const fresh = await prepareWasmFilters(
			[{ ...publicFilter, config: { ...publicFilter.config, application_id: replacement.id, settings: {} } }],
			stored,
		);
		expect(JSON.parse(decrypt(fresh[0].config.sealed_settings)).args).toEqual([]);
	});
	it("materializes verified settings in a private stable chain with a binding token and redacts public activation state", async () => {
		const row = await upload();
		const settings = {
			args: ["private-argument"],
			env: [{ name: "PRIVATE_ENV", value: "private-value" }],
			timeout_ms: 1700,
		};
		const stored = await prepareWasmFilters([application({ settings }), header()]);
		const prepared = await materializeWasmHost(host(stored));
		const repeated = await materializeWasmHost(host(stored));
		expect(repeated.configuration_path).toBe(prepared.configuration_path);
		const contents = await fs.readFile(prepared.configuration_path);
		const chain = JSON.parse(contents.toString());
		expect(path.basename(prepared.configuration_path)).toBe(`741-${digest(contents)}.json`);
		expect(chain.filters[0]).toMatchObject({
			id: "application",
			kind: "application",
			application_id: row.id,
			sha256: row.sha256,
			mode: "handler",
			protocol: "stdio",
			phase: "request",
			settings,
			authentication: false,
		});
		expect(chain.filters[0].bridge_token).toMatch(/^[a-f0-9]{64}$/);
		expect(await fs.readFile(chain.filters[0].path)).toEqual(fixture);
		expect((await fs.stat(prepared.configuration_path)).mode & 0o777).toBe(0o600);
		expect((await fs.stat(path.dirname(prepared.configuration_path))).mode & 0o777).toBe(0o700);
		await markHostActive(741, prepared);
		const status = await getHostStatus(741);
		expect(status).toMatchObject({
			state: "active",
			applications: [{ filter_id: "application", application_id: row.id }],
			filter_count: 2,
		});
		const publicData = JSON.stringify({ status, filters: redactWasmFilters(stored), prepared });
		for (const secret of ["private-argument", "private-value", "PRIVATE_ENV", chain.filters[0].bridge_token])
			expect(publicData).not.toContain(secret);
		expect(status.configuration_file).toBeUndefined();
		expect(status.runtime_status_file).toBeUndefined();
	});
	it("keeps the accepted chain and activation state when artifact bytes or replacement settings are invalid", async () => {
		await upload();
		const stored = await prepareWasmFilters([application({ settings: { args: ["accepted"] } })]);
		const prepared = await materializeWasmHost(host(stored));
		const accepted = await fs.readFile(prepared.configuration_path);
		await markHostActive(741, prepared);
		const state = await getHostStatus(741);
		const chain = JSON.parse(accepted.toString());
		const changed = Buffer.from(fixture);
		changed[changed.length - 1] ^= 1;
		await fs.writeFile(chain.filters[0].path, changed);
		await expect(materializeWasmHost(host(stored))).rejects.toThrow(/hash mismatch/);
		expect(await fs.readFile(prepared.configuration_path)).toEqual(accepted);
		expect(await getHostStatus(741)).toEqual(state);
		await fs.writeFile(chain.filters[0].path, fixture);
		const broken = structuredClone(stored);
		broken[0].config.sealed_settings = "unreadable-ciphertext";
		await expect(materializeWasmHost(host(broken))).rejects.toThrow(/settings are unavailable/);
		expect(await fs.readFile(prepared.configuration_path)).toEqual(accepted);
		expect(await getHostStatus(741)).toEqual(state);
	});
	it("binds different write-only ciphertext to distinct private chain versions while retaining the accepted file", async () => {
		await upload();
		const settings = { args: ["same-private-value"] };
		const first = await materializeWasmHost(host(await prepareWasmFilters([application({ settings })])));
		const accepted = await fs.readFile(first.configuration_path);
		const second = await materializeWasmHost(host(await prepareWasmFilters([application({ settings })])));
		expect(second.configuration_path).not.toBe(first.configuration_path);
		expect(await fs.readFile(first.configuration_path)).toEqual(accepted);
	});
});
