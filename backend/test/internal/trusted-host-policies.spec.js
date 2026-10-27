import { describe, expect, it } from "vitest";
import { validateTrustedHostPolicies } from "../../lib/trusted-host-policies.js";

describe("trusted revision policy normalization", () => {
	it("keeps an encrypted historical protected host disabled without requiring retired credentials", () => {
		const candidate = {
			forward_scheme: "http",
			enabled: true,
			meta: {
				note: "retained",
				wasm_filters: [{ enabled: true, kind: "application", config: { sealed_settings: "unavailable" } }],
			},
		};
		validateTrustedHostPolicies(candidate, {});
		expect(candidate.enabled).toBe(0);
		expect(candidate.meta.note).toBe("retained");
		expect(candidate.meta).not.toHaveProperty("wasm_filters");
		expect(candidate.meta).not.toHaveProperty("nginx_err");
	});
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
});
