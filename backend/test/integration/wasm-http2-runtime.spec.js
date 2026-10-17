import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/nginx.js", () => ({ default: { withConfigurationLock: (action) => action() } }));
vi.mock("../../lib/encryption.js", () => ({
	encrypt: (value) => `sealed:${Buffer.from(value).toString("base64")}`,
	decrypt: (value) => Buffer.from(value.slice(7), "base64").toString(),
}));

import { executeWasmPreflight, materializeWasmHost, prepareWasmFilters } from "../../internal/wasm.js";
import modules from "../../internal/wasm-modules.js";

const suite = process.env.SHIELDPM_WASM_NGINX_BINARY ? describe : describe.skip;

suite("genuine uploaded Wasm request-body transports", () => {
	let directory;
	let prepared;
	const configuration = { transportProof: "independent module" };
	beforeAll(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "wasm-http2-runtime-"));
		vi.stubEnv("DATA_PATH", directory);
		const bytes = await fs.readFile(new URL("../fixtures/custom-proxy-wasm.wasm", import.meta.url));
		const uploaded = await modules.upload({ can: async () => true }, bytes, {
			name: "Body proof",
			filename: "body-proof.wasm",
		});
		const filters = await prepareWasmFilters([
			{
				id: "body",
				kind: "module",
				enabled: true,
				failure_mode: "closed",
				config: { module_id: uploaded.id, configuration },
			},
		]);
		prepared = await materializeWasmHost({ id: 901, enabled: true, meta: { wasm_filters: filters } });
	});
	afterAll(async () => {
		vi.unstubAllEnvs();
		if (directory) await fs.rm(directory, { recursive: true, force: true });
	});
	it.each([
		["HTTP/1.1 chunked", { chunked: true }],
		["HTTP/2 DATA without Content-Length or Transfer-Encoding", { http2: true }],
	])(
		"delivers exact request bytes and EOF using %s",
		async (_name, transport) => {
			const requestBody = "body-without-content-length";
			const result = await executeWasmPreflight(prepared, {}, { ...transport, requestBody });
			expect(result.status).toBe(200);
			expect(result.runtime_error).toBeUndefined();
			expect(result.body).toBe(`SHIELDPM_WASM_OK:${requestBody}\n`);
			expect(result.headers["x-custom-response"]).toBe(JSON.stringify(configuration));
			expect(result.headers["x-custom-chunks"]).toBe("1");
			expect(result.headers["x-custom-final"]).toBe("1");
		},
		15000,
	);
	it("delivers multiple buffered chunks and final bytes over HTTP/2 without length headers", async () => {
		const lastChunk = "exact-final-request-chunk";
		const requestBody = `${"a".repeat(65536)}${lastChunk}`;
		const result = await executeWasmPreflight(prepared, {}, { http2: true, requestBody });
		expect(result.status).toBe(200);
		expect(result.runtime_error).toBeUndefined();
		expect(result.body).toBe(`SHIELDPM_WASM_OK:${lastChunk}\n`);
		expect(result.headers["x-custom-chunks"]).toBe("2");
		expect(result.headers["x-custom-final"]).toBe("1");
		expect(result.headers["x-custom-response"]).toBe(JSON.stringify(configuration));
	}, 15000);
});
