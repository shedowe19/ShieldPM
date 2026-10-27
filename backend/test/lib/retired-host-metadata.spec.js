import { describe, expect, it } from "vitest";
import { hasActiveRetiredHostBindings, retireHostRuntime } from "../../lib/retired-host-metadata.js";

describe("retired host policy safety", () => {
	it.each(["api_key", "module", "application"])(
		"disables a former active %s binding without changing user notes",
		(kind) => {
			const host = {
				enabled: true,
				note: "original note",
				meta: { custom: { keep: true }, wasm_filters: [{ enabled: true, kind }] },
			};
			const before = structuredClone(host);
			expect(retireHostRuntime(host)).toEqual({
				enabled: 0,
				note: "original note",
				meta: { custom: { keep: true }, nginx_online: false },
			});
			expect(host).toEqual(before);
		},
	);
	it.each([{ filters: [] }, { filters: [{ enabled: false }] }, { filters: [{ enabled: 0 }] }])(
		"preserves host enablement when no binding was active: %#",
		({ filters }) => {
			const host = { enabled: true, meta: { wasm_filters: filters, wasm_status: "retired", note: "keep" } };
			expect(hasActiveRetiredHostBindings(host.meta)).toBe(false);
			expect(retireHostRuntime(host)).toEqual({ enabled: true, meta: { note: "keep" } });
		},
	);
	it("handles historic camel-case binding metadata and preserves an existing ordinary error", () => {
		expect(
			retireHostRuntime({
				enabled: true,
				meta: { wasmFilters: [{ enabled: true }], wasmStatus: "active", nginx_err: "existing error" },
			}),
		).toEqual({ enabled: 0, meta: { nginx_online: false, nginx_err: "existing error" } });
	});
	it.each([
		JSON.stringify({ wasm_filters: [{ enabled: true }] }),
		JSON.stringify(JSON.stringify({ wasm_filters: [{ enabled: true }] })),
		{ wasm_filters: '[{"enabled":true}]' },
		{ wasm_filters: { enabled: true } },
		{ wasm_filters: "malformed policy" },
		{ wasm_filters: [{ kind: "application" }] },
	])("disables serialized or ambiguous legacy binding containers: %#", (meta) => {
		expect(retireHostRuntime({ enabled: 1, meta }).enabled).toBe(0);
		expect(retireHostRuntime({ enabled: 1, meta }).meta).not.toHaveProperty("wasm_filters");
	});
	it.each([{ meta: "not-json-secret" }, { meta: '"unresolved primitive"' }, { meta: [] }, { meta: 1 }])(
		"rejects ambiguous root metadata without exposing its contents: %#",
		({ meta }) => {
			expect(() => retireHostRuntime({ enabled: 1, meta })).toThrow(/^Host metadata requires review/);
		},
	);
});
