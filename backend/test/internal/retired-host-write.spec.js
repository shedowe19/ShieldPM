import { describe, expect, it } from "vitest";
import { prepareProxyHostPolicies } from "../../internal/proxy-host-policies.js";

describe("host writes after removal of request runtimes", () => {
	it.each(["object", "serialized", "double-serialized"])(
		"disables a legacy protected current host before merging new metadata: %s",
		async (mode) => {
			let meta = {
				note: "before",
				ip_firewall: { enabled: true },
				wasm_filters: [{ enabled: true, kind: "application" }],
			};
			if (mode !== "object") meta = JSON.stringify(meta);
			if (mode === "double-serialized") meta = JSON.stringify(meta);
			const current = { id: 1, enabled: true, forward_scheme: "http", meta };
			const data = { enabled: true, meta: { note: "after" } };
			await prepareProxyHostPolicies(data, current);
			expect(data.enabled).toBe(0);
			expect(data.meta).toMatchObject({ note: "after", ip_firewall: { enabled: true } });
			expect(data.meta).not.toHaveProperty("wasm_filters");
			expect(data.meta).not.toHaveProperty("0");
		},
	);
	it("accepts stale explicit active bindings only as disabled hosts", async () => {
		const data = { enabled: true, forward_scheme: "http", meta: { wasmFilters: { enabled: true }, note: "keep" } };
		await prepareProxyHostPolicies(data);
		expect(data.enabled).toBe(0);
		expect(data.meta).toMatchObject({ note: "keep", nginx_online: false });
		expect(data.meta).not.toHaveProperty("wasmFilters");
	});
	it("preserves a normal host whose old bindings were explicitly disabled", async () => {
		const data = {
			enabled: true,
			forward_scheme: "http",
			meta: { wasm_filters: [{ enabled: false }], note: "keep" },
		};
		await prepareProxyHostPolicies(data);
		expect(data.enabled).toBe(true);
		expect(data.meta.note).toBe("keep");
		expect(data.meta).not.toHaveProperty("wasm_filters");
	});
});
