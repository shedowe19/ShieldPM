import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ analyticCountQuery: vi.fn(), logKnex: null, proxyHostQuery: vi.fn() }));

vi.mock("../../models/proxy_host.js", () => ({ default: { query: mocks.proxyHostQuery } }));
vi.mock("../../models/analytic_count.js", () => ({ default: { query: mocks.analyticCountQuery } }));
vi.mock("../../models/analytics_logs.js", () => ({ default: { knex: () => mocks.logKnex } }));

import { AnalyticsService } from "../../internal/analytics.js";

const createQuery = (result) => {
	const query = {
		andWhere: vi.fn(() => query),
		andWhereNot: vi.fn(() => query),
		count: vi.fn(() => query),
		first: vi.fn().mockResolvedValue(result),
		groupBy: vi.fn(() => query),
		limit: vi.fn().mockResolvedValue([]),
		orderBy: vi.fn(() => query),
		select: vi.fn(() => query),
		sum: vi.fn(() => query),
		where: vi.fn(() => query),
		whereNotNull: vi.fn(() => query),
	};
	return query;
};

describe("analytics summary windows", () => {
	const timeFilters = [];
	beforeEach(() => {
		timeFilters.length = 0;
		mocks.proxyHostQuery.mockReturnValue(createQuery({ id: 7, owner_user_id: 2 }));
		mocks.analyticCountQuery.mockReturnValue(createQuery({ count: "12", s2xx: "9" }));
		mocks.logKnex = () => {
			const query = createQuery({});
			query.andWhere.mockImplementation((column, operator, value) => {
				if (column === "time" && operator === ">=") timeFilters.push(value);
				return query;
			});
			return query;
		};
	});

	it("uses the 24-hour detail window for top lists while keeping the 30-day KPI window", async () => {
		const access = {
			can: vi.fn().mockResolvedValue({ roles: ["admin"] }),
			token: { getUserId: () => 2 },
		};
		const summary = await new AnalyticsService().getHostSummary(access, 7, "30d");

		expect(summary.kpi_window.range).toBe("30d");
		expect(summary.kpi_window.resolution).toBe("day");
		expect(summary.detail_window.complete).toBe(false);
		expect(summary.detail_window.retention_hours).toBe(24);
		expect(timeFilters).toHaveLength(6);

		const now = Date.now();
		for (const value of timeFilters) {
			const ageHours = (now - Date.parse(value)) / (60 * 60 * 1000);
			expect(ageHours).toBeGreaterThan(23.9);
			expect(ageHours).toBeLessThan(24.1);
		}
	});
});
