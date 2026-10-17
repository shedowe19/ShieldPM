import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/encryption.js", () => ({
	encrypt: (value) => `sealed:${Buffer.from(value).toString("base64")}`,
	decrypt: (value) => Buffer.from(value.slice(7), "base64").toString(),
}));
const {
	validateWasmFilters,
	prepareWasmFilters,
	redactWasmFilters,
	materializeWasmHost,
	encodeWasmConfiguration,
	executeWasmPreflight,
	prepareHost,
	selfTest,
} = await import("../../internal/wasm.js");
const policy = (kind = "api_key", config = { header: "x-api-key", value: "a-real-key" }) => ({
	id: "policy",
	kind,
	enabled: true,
	failure_mode: "closed",
	config,
});
let directory;
let priorData;
let priorNginxConfig;
beforeAll(async () => {
	directory = await fs.mkdtemp(path.join(os.tmpdir(), "wasm-test-"));
	priorData = process.env.DATA_PATH;
	process.env.DATA_PATH = directory;
	priorNginxConfig = process.env.SHIELDPM_NGINX_CONF;
	process.env.SHIELDPM_NGINX_CONF = path.join(directory, "runtime-global.conf");
	await fs.writeFile(process.env.SHIELDPM_NGINX_CONF, "http {\nwasm_vm wasmtime;\n}\n");
});
afterAll(async () => {
	if (priorData === undefined) delete process.env.DATA_PATH;
	else process.env.DATA_PATH = priorData;
	if (priorNginxConfig === undefined) delete process.env.SHIELDPM_NGINX_CONF;
	else process.env.SHIELDPM_NGINX_CONF = priorNginxConfig;
	await fs.rm(directory, { recursive: true, force: true });
});

describe("trusted Wasm contract", () => {
	it("encrypts keys, redacts them, and preserves blank replacements by stable ID", async () => {
		const stored = await prepareWasmFilters([policy()]);
		expect(stored[0].config.value).toBeUndefined();
		expect(stored[0].config.sealed_value).not.toContain("a-real-key");
		const publicFilters = redactWasmFilters(stored);
		expect(publicFilters[0].config).toEqual({ header: "x-api-key", has_secret: true });
		const unchanged = await prepareWasmFilters(
			[{ ...publicFilters[0], config: { ...publicFilters[0].config, value: "" } }],
			stored,
		);
		expect(unchanged[0].config.sealed_value).toBe(stored[0].config.sealed_value);
		expect(await prepareWasmFilters([], stored)).toEqual([]);
	});
	it("rejects missing keys, duplicate IDs, caller ciphertext, open authentication, and framing headers", async () => {
		await expect(prepareWasmFilters([policy("api_key", { header: "x-key" })])).rejects.toThrow(/requires a key/);
		expect(() => validateWasmFilters([policy(), policy()])).toThrow(/unique/);
		expect(() =>
			validateWasmFilters([
				{
					...policy("request_header", { header: "x-api-key", operation: "set", value: "a-real-key" }),
					id: "spoof",
				},
				policy(),
			]),
		).toThrow(/Authentication must run before/);
		expect(() =>
			validateWasmFilters([policy("api_key", { header: "x-key", sealed_value: "ciphertext" })]),
		).toThrow();
		expect(() => validateWasmFilters([{ ...policy(), failure_mode: "open" }])).toThrow(/fail-closed/);
		expect(() =>
			validateWasmFilters([policy("request_header", { header: "Host", operation: "set", value: "evil" })]),
		).toThrow(/Framing/);
		expect(() =>
			validateWasmFilters([policy("request_header", { header: "x-safe", operation: "set", value: "a\r\nb" })]),
		).toThrow();
	});
	it("bounds chains, values, Unicode bytes and validates the exact kind contract", () => {
		expect(() =>
			validateWasmFilters(Array.from({ length: 9 }, (_, i) => ({ ...policy(), id: `p${i}` }))),
		).toThrow();
		expect(() => validateWasmFilters([policy("local_response", { status: 503, body: "😀".repeat(2048) })])).toThrow(
			/4096 bytes/,
		);
		expect(() => validateWasmFilters([policy("response_header", { header: "x-safe", operation: "set" })])).toThrow(
			/value/,
		);
		expect(() => validateWasmFilters([policy("local_response", { status: 700, body: "bad" })])).toThrow();
	});
	it("encodes bounded binary configuration with UTF-8 byte lengths", () => {
		const encoded = Buffer.from(
			encodeWasmConfiguration(policy("response_header", { header: "x-policy", operation: "set", value: "ä" })),
			"base64",
		);
		expect(encoded.readUInt32LE(0)).toBe(4);
		expect(encoded.readUInt32LE(4)).toBe(8);
		expect(encoded.readUInt32LE(8)).toBe(2);
	});
	it("materializes immutable hashed artifacts and detects tampering", async () => {
		const host = {
			id: 22,
			enabled: true,
			meta: { wasm_filters: [policy("request_header", { header: "x-policy", operation: "set", value: "one" })] },
		};
		const first = await materializeWasmHost(host);
		const again = await materializeWasmHost(host);
		expect(again.configuration_path).toBe(first.configuration_path);
		const previous = await fs.readFile(first.configuration_path, "utf8");
		host.meta.wasm_filters[0].config.value = "two";
		const second = await materializeWasmHost(host);
		expect(second.configuration_path).not.toBe(first.configuration_path);
		expect(await fs.readFile(first.configuration_path, "utf8")).toBe(previous);
		await fs.writeFile(second.configuration_path, "tampered");
		await expect(materializeWasmHost(host)).rejects.toThrow(/Immutable/);
		expect((await fs.stat(first.configuration_path)).mode & 0o777).toBe(0o600);
	});
	it("does not require a Wasm runtime for hosts without enabled filters", async () => {
		expect(await prepareHost({ id: 1, enabled: true, meta: {} })).toBeNull();
	});
	it("publishes complete private artifacts when independent requests prepare the same chain concurrently", async () => {
		const host = {
			id: 23,
			enabled: true,
			meta: {
				wasm_filters: [
					policy("request_header", { header: "x-concurrent", operation: "set", value: "complete" }),
				],
			},
		};
		const prepared = await Promise.all(Array.from({ length: 8 }, () => materializeWasmHost(host)));
		expect(new Set(prepared.map((entry) => entry.configuration_path)).size).toBe(1);
		const chain = JSON.parse(await fs.readFile(prepared[0].configuration_path, "utf8"));
		expect(chain.filters).toHaveLength(1);
		expect(
			createHash("sha256")
				.update(await fs.readFile(chain.filters[0].path))
				.digest("hex"),
		).toBe(chain.filters[0].sha256);
		for (const name of ["hosts", "artifacts"]) {
			expect((await fs.readdir(path.join(directory, "wasm", name))).some((entry) => entry.endsWith(".tmp"))).toBe(
				false,
			);
		}
		expect((await fs.stat(prepared[0].configuration_path)).mode & 0o777).toBe(0o600);
	});
});

describe.skipIf(!process.env.SHIELDPM_WASM_NGINX_BINARY)("actual API7 Nginx execution", () => {
	it("executes API-key and ordered header policies, local replies, and remove operations", async () => {
		expect(await selfTest()).toMatchObject({ available: true, state: "functional", abi: "0.2.1" });
		const filters = [
			policy("response_header", { header: "x-chain", operation: "set", value: "one" }),
			{ ...policy("response_header", { header: "x-chain", operation: "set", value: "two" }), id: "second" },
		];
		let prepared = await prepareHost({ id: 33, enabled: true, meta: { wasm_filters: filters } });
		expect((await executeWasmPreflight(prepared)).headers["x-chain"]).toBe("two");
		filters.push({ ...policy("response_header", { header: "x-chain", operation: "remove" }), id: "third" });
		prepared = await prepareHost({ id: 33, enabled: true, meta: { wasm_filters: filters } });
		expect((await executeWasmPreflight(prepared)).headers["x-chain"]).toBeUndefined();
		prepared = await prepareHost({
			id: 34,
			enabled: true,
			meta: { wasm_filters: [policy("local_response", { status: 503, body: "Maintenance" })] },
		});
		expect(await executeWasmPreflight(prepared)).toMatchObject({ status: 503, body: "Maintenance" });
	}, 20000);
	it.each([
		["closed", false, 503],
		["open", false, 200],
		["open", true, 503],
	])(
		"handles runtime traps with %s strategy (authentication %s)",
		async (failureMode, authentication, expectedStatus) => {
			const prepared = await materializeWasmHost({
				id: 51,
				enabled: true,
				meta: {
					wasm_filters: [policy("request_header", { header: "x-probe", operation: "set", value: "yes" })],
				},
			});
			// Minimal Proxy-Wasm ABI-0.2.1 module whose request callback deliberately traps.
			const trap = Buffer.from(
				"AGFzbQEAAAABHwZgAABgAX8Bf2ACf38AYAJ/fwF/YAF/AGADf39/AX8DCAcAAQIDAQQFBQMBAAEHqwEIBm1lbW9yeQIAF3Byb3h5X2FiaV92ZXJzaW9uXzBfMl8xAAAYcHJveHlfb25fbWVtb3J5X2FsbG9jYXRlAAEXcHJveHlfb25fY29udGV4dF9jcmVhdGUAAhJwcm94eV9vbl9jb25maWd1cmUAAw1wcm94eV9vbl9kb25lAAQPcHJveHlfb25fZGVsZXRlAAUYcHJveHlfb25fcmVxdWVzdF9oZWFkZXJzAAYKHgcCAAsFAEGAIAsCAAsEAEEBCwQAQQELAgALAwAACw==",
				"base64",
			);
			const trapPath = path.join(directory, "trap.wasm");
			await fs.writeFile(trapPath, trap);
			const chain = JSON.parse(await fs.readFile(prepared.configuration_path, "utf8"));
			Object.assign(chain.filters[0], {
				path: trapPath,
				sha256: createHash("sha256").update(trap).digest("hex"),
				failure_mode: failureMode,
				authentication,
			});
			const configPath = path.join(directory, `trap-${failureMode}-${authentication}.json`);
			await fs.writeFile(configPath, JSON.stringify(chain));
			const result = await executeWasmPreflight({ ...prepared, configuration_path: configPath });
			expect(result.status).toBe(expectedStatus);
			const status = JSON.parse(await fs.readFile(prepared.status_path, "utf8"));
			expect(status).toMatchObject({ state: "error", filter_id: "policy", phase: "request" });
			expect(JSON.stringify(status)).not.toContain("a-real-key");
			expect((await executeWasmPreflight(prepared)).status).toBe(200);
		},
		15000,
	);
	it("rejects runtime artifact hash mismatches while retaining the previous immutable chain", async () => {
		const prepared = await materializeWasmHost({
			id: 52,
			enabled: true,
			meta: { wasm_filters: [policy("request_header", { header: "x-probe", operation: "set", value: "yes" })] },
		});
		const original = await fs.readFile(prepared.configuration_path, "utf8");
		const chain = JSON.parse(original);
		chain.filters[0].sha256 = "0".repeat(64);
		const configPath = path.join(directory, "bad-hash.json");
		await fs.writeFile(configPath, JSON.stringify(chain));
		await expect(executeWasmPreflight({ ...prepared, configuration_path: configPath })).rejects.toThrow(
			/execution preflight/,
		);
		expect(await fs.readFile(prepared.configuration_path, "utf8")).toBe(original);
		expect((await executeWasmPreflight(prepared)).status).toBe(200);
	}, 15000);
	it("removes upstream secrets and cookies when a closed response policy traps", async () => {
		const filters = [
			{
				...policy("response_header", { header: "x-private-upstream", operation: "set", value: "secret" }),
				id: "secret",
			},
			{
				...policy("response_header", { header: "set-cookie", operation: "set", value: "session=private" }),
				id: "cookie",
			},
			{ ...policy("response_header", { header: "x-private-upstream", operation: "remove" }), id: "remove" },
			{
				...policy("response_header", { header: "x-after-failure", operation: "set", value: "unsafe" }),
				id: "after",
			},
		];
		const prepared = await materializeWasmHost({ id: 53, enabled: true, meta: { wasm_filters: filters } });
		// ABI-0.2.1 module whose request/response header callback deliberately traps.
		const trap = Buffer.from(
			"AGFzbQEAAAABHwZgAABgAX8Bf2ACf38AYAJ/fwF/YAF/AGADf39/AX8DCAcAAQIDAQQFBQMBAAEHxwEJBm1lbW9yeQIAF3Byb3h5X2FiaV92ZXJzaW9uXzBfMl8xAAAYcHJveHlfb25fbWVtb3J5X2FsbG9jYXRlAAEXcHJveHlfb25fY29udGV4dF9jcmVhdGUAAhJwcm94eV9vbl9jb25maWd1cmUAAw1wcm94eV9vbl9kb25lAAQPcHJveHlfb25fZGVsZXRlAAUYcHJveHlfb25fcmVxdWVzdF9oZWFkZXJzAAYZcHJveHlfb25fcmVzcG9uc2VfaGVhZGVycwAGCh4HAgALBQBBgCALAgALBABBAQsEAEEBCwIACwMAAAs=",
			"base64",
		);
		const trapPath = path.join(directory, "response-trap.wasm");
		await fs.writeFile(trapPath, trap);
		const chain = JSON.parse(await fs.readFile(prepared.configuration_path, "utf8"));
		Object.assign(chain.filters[2], { path: trapPath, sha256: createHash("sha256").update(trap).digest("hex") });
		const configPath = path.join(directory, "response-trap.json");
		await fs.writeFile(configPath, JSON.stringify(chain));
		const closed = await executeWasmPreflight({ ...prepared, configuration_path: configPath });
		expect(closed).toMatchObject({ status: 503, body: "", headers: { "cache-control": "no-store" } });
		expect(closed.headers["x-private-upstream"]).toBeUndefined();
		expect(closed.headers["set-cookie"]).toBeUndefined();
		expect(closed.headers["x-after-failure"]).toBeUndefined();
		chain.filters[2].failure_mode = "open";
		await fs.writeFile(configPath, JSON.stringify(chain));
		const open = await executeWasmPreflight({ ...prepared, configuration_path: configPath });
		expect(open.status).toBe(200);
		expect(open.headers["x-private-upstream"]).toBe("secret");
		expect(open.headers["set-cookie"]).toEqual(["session=private"]);
		expect(open.headers["x-after-failure"]).toBe("unsafe");
	}, 15000);
});
