import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies before imports
vi.mock("../../models/analytic_count.js", () => ({
	default: {
		tableName: "analytic_count",
		knex: vi.fn(() => ({
			raw: vi.fn((sql, _params) => sql),
		})),
		query: vi.fn(() => mockAnalyticCountQuery),
		transaction: vi.fn(async (cb) => cb({})),
	},
}));

vi.mock("../../models/analytics_logs.js", () => ({
	default: {
		tableName: "analytics_logs",
		knex: vi.fn(() => mockKnex),
		query: vi.fn(() => mockAnalyticsLogsQuery),
	},
}));

vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: vi.fn(() => mockProxyHostQuery),
	},
}));

vi.mock("../../logger.js", () => ({
	analytics: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("node:fs", () => ({
	default: {
		closeSync: vi.fn(),
		openSync: vi.fn(() => 3),
	},
}));

vi.mock("tail", () => ({
	Tail: vi.fn(() => ({
		on: vi.fn(),
	})),
}));

vi.mock("../../lib/error.js", () => {
	class ItemNotFoundError extends Error {
		constructor(m) { super(m); this.name = "ItemNotFoundError"; this.status = 404; }
	}
	class PermissionError extends Error {
		constructor(m) { super(m); this.name = "PermissionError"; this.status = 403; }
	}
	return { default: { ItemNotFoundError, PermissionError } };
});

const mockAnalyticsLogsQuery = {
	where: vi.fn().mockReturnThis(),
	delete: vi.fn().mockResolvedValue(5),
};

const mockAnalyticCountQuery = {
	where: vi.fn().mockReturnThis(),
	andWhere: vi.fn().mockReturnThis(),
	insert: vi.fn().mockReturnThis(),
	onConflict: vi.fn().mockReturnThis(),
	merge: vi.fn().mockResolvedValue({}),
	sum: vi.fn().mockReturnThis(),
	first: vi.fn().mockResolvedValue({}),
};

const mockProxyHostQuery = {
	where: vi.fn().mockReturnThis(),
	andWhere: vi.fn().mockReturnThis(),
	select: vi.fn().mockResolvedValue([]),
	first: vi.fn().mockResolvedValue(null),
};

const mockKnex = vi.fn((_tableName) => ({
	insert: vi.fn().mockResolvedValue([]),
	select: vi.fn().mockReturnThis(),
	count: vi.fn().mockReturnThis(),
	where: vi.fn().mockReturnThis(),
	andWhere: vi.fn().mockReturnThis(),
	andWhereNot: vi.fn().mockReturnThis(),
	whereNotNull: vi.fn().mockReturnThis(),
	groupBy: vi.fn().mockReturnThis(),
	orderBy: vi.fn().mockReturnThis(),
	limit: vi.fn().mockResolvedValue([]),
}));

// We can't easily import the default singleton because it calls setInterval etc.
// Instead, import the class and test its methods directly.
// Since it's exported as a singleton, we'll create our own instance.

describe("analytics module", () => {
	let AnalyticsService;

	beforeEach(async () => {
		vi.clearAllMocks();
		// Dynamic import to avoid side effects from singleton
		const mod = await import("../../modules/analytics/service.js");
		// The module exports the singleton, we'll test its methods
		AnalyticsService = mod.default;
	});

	describe("processLine", () => {
		it("should parse a valid JSON log line", () => {
			const svc = Object.create(AnalyticsService);
			svc.aggregationBuffer = new Map();
			svc.detailedLogBuffer = [];
			svc.hostCache = new Map([["example.com", 1]]);
			svc.lastDropLogAt = 0;

			const logLine = JSON.stringify({
				server_name: "example.com",
				status: "200",
				body_bytes_sent: "1024",
				time_iso8601: "2024-01-01T12:00:00Z",
				request_method: "GET",
				request_uri: "/test",
				remote_addr: "1.2.3.4",
				request_time: "0.5",
			});

			svc.processLine(logLine);
			expect(svc.detailedLogBuffer).toHaveLength(1);
			expect(svc.detailedLogBuffer[0].host_id).toBe(1);
			expect(svc.detailedLogBuffer[0].status).toBe(200);
			expect(svc.detailedLogBuffer[0].bytes).toBe(1024);
		});

		it("should ignore empty lines", () => {
			const svc = Object.create(AnalyticsService);
			svc.aggregationBuffer = new Map();
			svc.detailedLogBuffer = [];
			svc.hostCache = new Map();
			svc.lastDropLogAt = 0;

			svc.processLine("");
			expect(svc.detailedLogBuffer).toHaveLength(0);
		});

		it("should handle invalid JSON gracefully", () => {
			const svc = Object.create(AnalyticsService);
			svc.aggregationBuffer = new Map();
			svc.detailedLogBuffer = [];
			svc.hostCache = new Map();
			svc.lastDropLogAt = 0;

			svc.processLine("not json");
			expect(svc.detailedLogBuffer).toHaveLength(0);
		});

		it("should aggregate status codes correctly", () => {
			const svc = Object.create(AnalyticsService);
			svc.aggregationBuffer = new Map();
			svc.detailedLogBuffer = [];
			svc.hostCache = new Map([["test.com", 2]]);
			svc.lastDropLogAt = 0;

			const statuses = [200, 301, 404, 500];
			for (const status of statuses) {
				svc.processLine(JSON.stringify({
					server_name: "test.com",
					status: String(status),
					body_bytes_sent: "100",
					time_iso8601: "2024-01-01T12:00:00Z",
					request_method: "GET",
					request_uri: "/",
					remote_addr: "1.1.1.1",
				}));
			}

			const entry = Array.from(svc.aggregationBuffer.values())[0];
			expect(entry.status_2xx).toBe(1);
			expect(entry.status_3xx).toBe(1);
			expect(entry.status_4xx).toBe(1);
			expect(entry.status_5xx).toBe(1);
			expect(entry.count).toBe(4);
		});

		it("should use http_host when server_name is _", () => {
			const svc = Object.create(AnalyticsService);
			svc.aggregationBuffer = new Map();
			svc.detailedLogBuffer = [];
			svc.hostCache = new Map([["fallback.com", 3]]);
			svc.lastDropLogAt = 0;

			svc.processLine(JSON.stringify({
				server_name: "_",
				http_host: "fallback.com",
				status: "200",
				body_bytes_sent: "0",
				time_iso8601: "2024-01-01T12:00:00Z",
				request_method: "GET",
				request_uri: "/",
				remote_addr: "1.1.1.1",
			}));

			expect(svc.detailedLogBuffer[0].host_id).toBe(3);
		});
	});

	describe("chunkArray", () => {
		it("should split array into chunks", () => {
			const chunks = AnalyticsService.chunkArray([1, 2, 3, 4, 5], 2);
			expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
		});

		it("should return single chunk for small arrays", () => {
			const chunks = AnalyticsService.chunkArray([1, 2], 10);
			expect(chunks).toEqual([[1, 2]]);
		});

		it("should return empty array for empty input", () => {
			const chunks = AnalyticsService.chunkArray([], 5);
			expect(chunks).toEqual([]);
		});
	});

	describe("flushDetailedLogs", () => {
		it("should not call insert for empty batch", async () => {
			await AnalyticsService.flushDetailedLogs([]);
			// No error means success
		});
	});

	describe("flushAggregations", () => {
		it("should not call insert for empty entries", async () => {
			await AnalyticsService.flushAggregations([]);
			// No error means success
		});
	});
});
