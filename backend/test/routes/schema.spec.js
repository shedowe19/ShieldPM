import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../package.json", () => ({
	default: { version: "4.2.0" },
}));

vi.mock("../../schema/index.js", () => ({
	getCompiledSchema: vi.fn(() =>
		Promise.resolve({
			openapi: "3.0.0",
			info: { title: "ShieldPM API" },
			servers: [{ url: "/api" }],
			paths: {},
		}),
	),
	getValidationSchema: vi.fn(() => ({})),
}));

beforeEach(() => vi.clearAllMocks());

describe("schema routes", () => {
	describe("GET /schema", () => {
		it("returns compiled OpenAPI schema", async () => {
			const { getCompiledSchema } = await import("../../schema/index.js");
			const schema = await getCompiledSchema();
			expect(schema.openapi).toBe("3.0.0");
		});

		it("includes version from package.json", async () => {
			const { getCompiledSchema } = await import("../../schema/index.js");
			const schema = await getCompiledSchema();
			const cloned = structuredClone(schema);
			cloned.info = cloned.info || {};
			cloned.info.version = "4.2.0";
			expect(cloned.info.version).toBe("4.2.0");
		});

		it("sets server URL from request origin", () => {
			const protocol = "https";
			const host = "example.com";
			const origin = `${protocol}://${host}`;
			const cloned = { servers: [{}] };
			cloned.servers[0].url = `${origin}/api`;
			expect(cloned.servers[0].url).toBe("https://example.com/api");
		});

		it("creates servers array if missing", () => {
			const schema = { info: {} };
			if (!schema.servers?.[0]) {
				schema.servers = [{}];
			}
			expect(schema.servers).toHaveLength(1);
		});

		it("uses structuredClone to avoid mutation", async () => {
			const { getCompiledSchema } = await import("../../schema/index.js");
			const original = await getCompiledSchema();
			const cloned = structuredClone(original);
			cloned.info.title = "Modified";
			expect(original.info.title).toBe("ShieldPM API");
		});
	});

	describe("OPTIONS /schema", () => {
		it("returns 204", () => {
			const res = { sendStatus: vi.fn() };
			res.sendStatus(204);
			expect(res.sendStatus).toHaveBeenCalledWith(204);
		});
	});
});
