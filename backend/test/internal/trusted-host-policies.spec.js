import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/config.js", () => ({ getEncryptionKey: () => "1".repeat(64) }));

import { encrypt } from "../../lib/encryption.js";
import { validateTrustedHostPolicies } from "../../lib/trusted-host-policies.js";

const applicationSnapshot = (sealedSettings, enabled = true) => ({
	forward_scheme: "http",
	meta: {
		wasm_filters: [
			{
				id: "application",
				kind: "application",
				enabled,
				failure_mode: "closed",
				config: {
					application_id: "a".repeat(64),
					mode: "handler",
					protocol: "stdio",
					sealed_settings: sealedSettings,
				},
			},
		],
	},
});

describe("trusted revision policy normalization", () => {
	it("removes policies absent from an older complete snapshot", () => {
		const candidate = { forward_scheme: "http", meta: {} };
		validateTrustedHostPolicies(candidate, {
			id: 1,
			meta: {
				upstream_pool: { enabled: true, targets: [{ id: "current", host: "new.internal", port: 8080 }] },
				cache_policy: { enabled: true },
			},
		});
		expect(candidate.meta).not.toHaveProperty("upstream_pool");
		expect(candidate.meta).not.toHaveProperty("cache_policy");
	});
	it("preserves sealed server snapshots while validating their actual decryptable secret", () => {
		const value = encrypt("private-revision-key");
		const candidate = {
			forward_scheme: "http",
			meta: {
				wasm_filters: [
					{
						id: "auth",
						kind: "api_key",
						enabled: true,
						failure_mode: "closed",
						config: { header: "x-api-key", sealed_value: value },
					},
				],
			},
		};
		validateTrustedHostPolicies(candidate, {});
		expect(candidate.meta.wasm_filters[0].config.sealed_value).toBe(value);
	});
	it("rejects corrupt or unavailable sealed credentials before host mutation", () => {
		expect(() =>
			validateTrustedHostPolicies(
				{
					forward_scheme: "http",
					meta: {
						wasm_filters: [
							{
								id: "auth",
								kind: "api_key",
								enabled: true,
								failure_mode: "closed",
								config: { header: "x-api-key", sealed_value: "corrupt" },
							},
						],
					},
				},
				{},
			),
		).toThrow("unavailable Wasm credential");
	});
	it("validates encrypted WASI settings without replacing the snapshot with plaintext", () => {
		const settings = {
			args: ["--format=json"],
			env: [{ name: "PRIVATE_KEY", value: "revision-secret" }],
			timeout_ms: 500,
		};
		const sealedSettings = encrypt(JSON.stringify(settings));
		const candidate = applicationSnapshot(sealedSettings);
		const before = structuredClone(candidate);
		validateTrustedHostPolicies(candidate, {});
		expect(candidate.meta.wasm_filters).toEqual(before.meta.wasm_filters);
		expect(JSON.stringify(candidate)).not.toContain("revision-secret");
		expect(candidate.meta.wasm_filters[0].config.sealed_settings).toBe(sealedSettings);
	});
	it.each([
		["corrupt ciphertext", "corrupt"],
		["non-JSON plaintext", encrypt("not-json")],
		["null settings", encrypt("null")],
		["unknown setting fields", encrypt(JSON.stringify({ preopens: { "/": "/data" } }))],
		["invalid argument type", encrypt(JSON.stringify({ args: [123] }))],
		["excessive timeout", encrypt(JSON.stringify({ timeout_ms: 60_001 }))],
		[
			"duplicate environment names",
			encrypt(
				JSON.stringify({
					env: [
						{ name: "KEY", value: "one" },
						{ name: "KEY", value: "two" },
					],
				}),
			),
		],
	])("rejects unavailable or invalid WASI snapshot settings: %s", (_label, sealedSettings) => {
		expect(() => validateTrustedHostPolicies(applicationSnapshot(sealedSettings), {})).toThrow(
			"unavailable WASI application settings",
		);
	});
	it("validates disabled WASI settings before a revision can reintroduce them", () => {
		expect(() => validateTrustedHostPolicies(applicationSnapshot("corrupt", false), {})).toThrow(
			"unavailable WASI application settings",
		);
	});
});
