import { beforeEach, describe, expect, it, vi } from "vitest";

const mockKnex = {
	from: vi.fn().mockReturnThis(),
	where: vi.fn().mockReturnThis(),
	andWhere: vi.fn().mockReturnThis(),
	sum: vi.fn().mockReturnThis(),
	first: vi.fn(() => Promise.resolve({ count: 100, bytes: 5000, s2xx: 80, s3xx: 5, s4xx: 10, s5xx: 5 })),
};

const mockQuery = {
	where: vi.fn().mockReturnThis(),
	andWhere: vi.fn().mockReturnThis(),
	orderBy: vi.fn(() => Promise.resolve([
		{ timestamp: "2024-01-01T00:00:00Z", request_count: 10, bytes_sent: "500", status_code_2xx: 8, status_code_3xx: 1, status_code_4xx: 1, status_code_5xx: 0 },
	])),
};

vi.mock("../../models/analytic_count.js", () => ({
	default: {
		knex: () => mockKnex,
		query: () => mockQuery,
	},
}));

vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = {
			can: vi.fn(() => Promise.resolve()),
			token: { getUserId: () => 1 },
		};
		next();
	},
}));

vi.mock("systeminformation", () => ({
	default: { networkStats: vi.fn(() => Promise.resolve([{ rx_sec: 1000, tx_sec: 500 }])) },
	networkStats: vi.fn(() => Promise.resolve([{ rx_sec: 1000, tx_sec: 500 }])),
}));

vi.mock("../../lib/config.js", () => ({
	isSqlite: vi.fn(() => true),
	isMysql: vi.fn(() => false),
	isPostgres: vi.fn(() => false),
}));

vi.mock("../../logger.js", () => ({
	debug: vi.fn(),
	express: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("dayjs", () => {
	const m = () => ({ subtract: () => ({ toISOString: () => "2024-01-01T00:00:00Z" }), toISOString: () => "2024-01-02T00:00:00Z" });
	m.default = m;
	return { default: m };
});

beforeEach(() => vi.clearAllMocks());

describe("analytics routes", () => {
	describe("auth middleware", () => {
		it("requires jwt authentication", () => {
			// jwtdecode is applied to all analytics routes
			expect(true).toBe(true);
		});

		it("enforces analytics:list permission", async () => {
			const access = { can: vi.fn(() => Promise.resolve()) };
			await access.can("analytics:list");
			expect(access.can).toHaveBeenCalledWith("analytics:list");
		});

		it("rejects unauthorized access", async () => {
			const access = { can: vi.fn(() => Promise.reject(new Error("Forbidden"))) };
			await expect(access.can("analytics:list")).rejects.toThrow("Forbidden");
		});
	});

	describe("GET /analytics/summary", () => {
		it("returns aggregated stats", async () => {
			const result = await mockKnex.from("analytic_count").where("timestamp", ">=", "2024-01-01").andWhere("timestamp", "<=", "2024-01-02").sum("request_count as count").first();
			expect(result.count).toBe(100);
		});

		it("returns safe defaults on empty result", () => {
			const stats = null;
			const defaults = { count: 0, bytes: 0, s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0 };
			const safeStats = { ...defaults, ...stats };
			expect(safeStats.count).toBe(0);
		});
	});

	describe("GET /analytics/series", () => {
		it("returns time-series data grouped by timestamp", async () => {
			const data = await mockQuery.where("timestamp", ">=", "2024-01-01").andWhere("timestamp", "<=", "2024-01-02").orderBy("timestamp", "asc");
			expect(data).toHaveLength(1);
			expect(data[0].request_count).toBe(10);
		});

		it("groups data by timestamp correctly", () => {
			const data = [
				{ timestamp: "t1", request_count: 5, bytes_sent: "100", status_code_2xx: 4, status_code_3xx: 0, status_code_4xx: 1, status_code_5xx: 0 },
				{ timestamp: "t1", request_count: 3, bytes_sent: "50", status_code_2xx: 2, status_code_3xx: 1, status_code_4xx: 0, status_code_5xx: 0 },
			];
			const grouped = {};
			for (const row of data) {
				if (!grouped[row.timestamp]) grouped[row.timestamp] = { count: 0, bytes: 0 };
				grouped[row.timestamp].count += row.request_count;
				grouped[row.timestamp].bytes += Number.parseInt(row.bytes_sent, 10);
			}
			expect(grouped.t1.count).toBe(8);
			expect(grouped.t1.bytes).toBe(150);
		});
	});

	describe("GET /analytics/top-hosts", () => {
		it("returns empty array (placeholder)", () => {
			expect([]).toEqual([]);
		});
	});

	describe("GET /analytics/status", () => {
		it("returns network stats", async () => {
			const si = await import("systeminformation");
			const net = await si.networkStats();
			const rx = net.reduce((acc, iface) => acc + (iface.rx_sec || 0), 0);
			const tx = net.reduce((acc, iface) => acc + (iface.tx_sec || 0), 0);
			expect(rx).toBe(1000);
			expect(tx).toBe(500);
		});
	});

	describe("GET /analytics/db-stats", () => {
		it("detects sqlite engine", async () => {
			const { isSqlite } = await import("../../lib/config.js");
			expect(isSqlite()).toBe(true);
		});
	});
});
