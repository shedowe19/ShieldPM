import { describe, expect, it, vi } from "vitest";

vi.mock("../../db.js", () => ({
	default: vi.fn(() => ({})),
}));

vi.mock("../../lib/helpers.js", () => ({
	convertBoolFieldsToInt: vi.fn((json) => json),
	convertIntFieldsToBool: vi.fn((json) => json),
}));

vi.mock("../../lib/config.js", () => ({
	isSqlite: vi.fn(() => true),
	configGet: vi.fn(),
	configHas: vi.fn(),
}));

vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../lib/encryption.js", () => ({
	encrypt: vi.fn((v) => `enc_${v}`),
	decrypt: vi.fn((v) => v),
}));

const { default: AnalyticCount } = await import("../../models/analytic_count.js");
const { default: AnalyticsLogs } = await import("../../models/analytics_logs.js");

describe("AnalyticCount model", () => {
	it("has correct tableName", () => {
		expect(AnalyticCount.tableName).toBe("analytic_count");
	});

	it("has correct idColumn", () => {
		expect(AnalyticCount.idColumn).toBe("id");
	});

	it("has jsonSchema with expected properties", () => {
		const schema = AnalyticCount.jsonSchema;
		expect(schema.type).toBe("object");
		expect(schema.properties).toHaveProperty("proxy_host_id");
		expect(schema.properties).toHaveProperty("status_code_2xx");
		expect(schema.properties).toHaveProperty("status_code_3xx");
		expect(schema.properties).toHaveProperty("status_code_4xx");
		expect(schema.properties).toHaveProperty("status_code_5xx");
		expect(schema.properties).toHaveProperty("bytes_sent");
		expect(schema.properties).toHaveProperty("request_count");
	});

	it("proxy_host_id allows null in schema", () => {
		const schema = AnalyticCount.jsonSchema;
		expect(schema.properties.proxy_host_id.type).toContain("null");
	});

	it("defines proxy_host relation", () => {
		const relations = AnalyticCount.relationMappings;
		expect(relations).toHaveProperty("proxy_host");
		expect(relations.proxy_host.join.from).toBe("analytic_count.proxy_host_id");
		expect(relations.proxy_host.join.to).toBe("proxy_host.id");
	});
});

describe("AnalyticsLogs model", () => {
	it("has correct tableName", () => {
		expect(AnalyticsLogs.tableName).toBe("analytics_logs");
	});

	it("has correct idColumn", () => {
		expect(AnalyticsLogs.idColumn).toBe("id");
	});

	it("has jsonSchema with expected properties", () => {
		const schema = AnalyticsLogs.jsonSchema;
		expect(schema.type).toBe("object");
		expect(schema.properties).toHaveProperty("host_id");
		expect(schema.properties).toHaveProperty("method");
		expect(schema.properties).toHaveProperty("path");
		expect(schema.properties).toHaveProperty("status");
		expect(schema.properties).toHaveProperty("ip");
		expect(schema.properties).toHaveProperty("user_agent");
	});

	it("method allows null in schema", () => {
		const schema = AnalyticsLogs.jsonSchema;
		expect(schema.properties.method.type).toContain("null");
	});

	it("has no relationMappings (standalone)", () => {
		expect(AnalyticsLogs.relationMappings).toBeNull();
	});
});
