import AuthStore from "src/modules/AuthStore";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as base from "./base";
import { getWasmArtifacts, uploadWasmArtifact } from "./wasm";

beforeEach(() => AuthStore.setCsrfToken("synthetic-csrf"));
afterEach(() => {
	AuthStore.clear();
	vi.unstubAllGlobals();
});

it("uploads unchanged bytes for server-side runtime detection using the authenticated client", async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValue(
			Response.json({ runtime: "wasi-preview1", artifact: { id: "a".repeat(64), created_on: "2026-10-18" } }),
		);
	vi.stubGlobal("fetch", fetchMock);
	const file = new File([new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])], "generic command.wasm");
	await expect(uploadWasmArtifact({ file, name: "Generic command" })).resolves.toMatchObject({
		runtime: "wasi-preview1",
		artifact: { createdOn: "2026-10-18" },
	});
	expect(fetchMock).toHaveBeenCalledWith(
		"/api/nginx/wasm/artifacts?filename=generic%20command.wasm&name=Generic%20command",
		expect.objectContaining({
			method: "POST",
			body: file,
			credentials: "include",
			headers: { "Content-Type": "application/wasm", "X-XSRF-TOKEN": "synthetic-csrf" },
		}),
	);
});

it("lists both artifact runtimes with cancellation", async () => {
	const fetchMock = vi.fn().mockResolvedValue(Response.json([]));
	vi.stubGlobal("fetch", fetchMock);
	const controller = new AbortController();
	await getWasmArtifacts(controller.signal);
	expect(fetchMock).toHaveBeenCalledWith(
		"/api/nginx/wasm/artifacts",
		expect.objectContaining({ method: "GET", signal: controller.signal }),
	);
});

it("serializes host execution settings without modifying argument values or environment names", async () => {
	const fetchMock = vi.fn().mockResolvedValue(Response.json({}));
	vi.stubGlobal("fetch", fetchMock);
	await base.put({
		url: "/nginx/proxy-hosts/7",
		data: {
			meta: {
				wasmFilters: [
					{
						id: "app",
						kind: "application",
						config: {
							applicationId: "a".repeat(64),
							mode: "handler",
							protocol: "stdio",
							settings: {
								args: ["Exact_CASE"],
								env: [{ name: "TenantID", value: "Synthetic_VALUE" }],
								timeoutMs: 1200,
							},
						},
					},
				],
			},
		},
	});
	expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
		meta: {
			wasm_filters: [
				{
					config: {
						application_id: "a".repeat(64),
						settings: {
							args: ["Exact_CASE"],
							env: [{ name: "TenantID", value: "Synthetic_VALUE" }],
							timeout_ms: 1200,
						},
					},
				},
			],
		},
	});
});
