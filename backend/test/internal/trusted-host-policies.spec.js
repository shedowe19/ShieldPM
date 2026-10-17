import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/config.js", () => ({ getEncryptionKey: () => "1".repeat(64) }));

import { encrypt } from "../../lib/encryption.js";
import { validateTrustedHostPolicies } from "../../lib/trusted-host-policies.js";

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
});
