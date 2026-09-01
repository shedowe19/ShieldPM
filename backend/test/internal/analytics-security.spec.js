import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	proxyHostQuery: vi.fn(),
}));

vi.mock("../../models/analytic_count.js", () => ({ default: {} }));
vi.mock("../../models/analytics_logs.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: mocks.proxyHostQuery } }));

import {
	AnalyticsService,
	parseAnalyticsRange,
	parseAnalyticsWindow,
	parseStrictIsoTimestamp,
} from "../../internal/analytics.js";

const fixedNow = new Date("2026-08-31T20:00:00.000Z");

const createSpool = () => ({
	append: vi.fn(),
	close: vi.fn(),
	compact: vi.fn().mockReturnValue(false),
	getReplayFloor: vi.fn().mockReturnValue(1),
	markCommitted: vi.fn(),
	open: vi.fn(),
	peek: vi.fn().mockReturnValue([]),
	pendingCount: 0,
});

const accessLogLine = (overrides = {}) =>
	JSON.stringify({
		time_iso8601: "2026-08-31T20:00:00+00:00",
		server_name: "EXAMPLE.TEST.",
		request_method: "GET",
		request_uri: "/",
		status: "200",
		body_bytes_sent: "12",
		remote_addr: "192.0.2.10",
		request_time: "0.025",
		...overrides,
	});

describe("analytics timestamp and access boundaries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("accepts complete timezone-aware timestamps and rejects rollover dates or partial dates", () => {
		expect(parseStrictIsoTimestamp("2024-02-29T23:59:59.123+01:00").toISOString()).toBe("2024-02-29T22:59:59.123Z");
		expect(() => parseStrictIsoTimestamp("2026-02-29T12:00:00Z")).toThrow(/real ISO 8601/);
		expect(() => parseStrictIsoTimestamp("2026-08-31")).toThrow(/complete ISO 8601/);
		expect(() => parseStrictIsoTimestamp("2026-08-31T12:00:00+14:30")).toThrow(/real ISO 8601/);
	});

	it("enforces ordered, bounded query windows and future clock skew", () => {
		expect(parseAnalyticsWindow({ start: "2026-08-30T20:00:00Z", end: "2026-08-31T20:00:00Z" }, fixedNow)).toEqual({
			start: "2026-08-30T20:00:00.000Z",
			end: "2026-08-31T20:00:00.000Z",
		});
		expect(() =>
			parseAnalyticsWindow({ start: "2026-08-31T20:00:00Z", end: "2026-08-31T20:00:00Z" }, fixedNow),
		).toThrow(/earlier/);
		expect(() =>
			parseAnalyticsWindow({ start: "2026-07-01T20:00:00Z", end: "2026-08-01T20:00:01Z" }, fixedNow),
		).toThrow(/30 days/);
		expect(() => parseAnalyticsWindow({ end: "2026-08-31T20:05:01Z" }, fixedNow)).toThrow(/future clock skew/);
		expect(parseAnalyticsRange("7d", fixedNow).start).toBe("2026-08-24T20:00:00.000Z");
		expect(() => parseAnalyticsRange("all", fixedNow)).toThrow(/range must be one of/);
	});

	it("durably accepts only valid access-log timestamps within future skew", () => {
		const spool = createSpool();
		const service = new AnalyticsService("/tmp/unused", { spool, now: () => fixedNow });
		service.accepting = true;
		service.hostCache.set("example.test", 7);

		expect(service.processLine(accessLogLine())).toBe(true);
		expect(spool.append).toHaveBeenCalledWith(
			expect.objectContaining({ host_id: 7, time: "2026-08-31T20:00:00.000Z", duration: 25 }),
		);
		expect(service.processLine(accessLogLine({ time_iso8601: "2026-08-31" }))).toBe(false);
		expect(service.processLine(accessLogLine({ time_iso8601: "2026-08-31T20:05:01Z" }))).toBe(false);
		expect(spool.append).toHaveBeenCalledTimes(1);
	});

	it("rejects an oversized request method before it can poison the durable spool", () => {
		const spool = createSpool();
		const service = new AnalyticsService("/tmp/unused", { spool, now: () => fixedNow });
		service.accepting = true;

		expect(service.processLine(accessLogLine({ request_method: "M".repeat(256) }))).toBe(false);
		expect(spool.append).not.toHaveBeenCalled();
		expect(service.processLine(accessLogLine({ request_method: "M".repeat(255) }))).toBe(true);
		expect(spool.append).toHaveBeenCalledWith(expect.objectContaining({ method: "M".repeat(255) }));
	});

	it("does not let an analytics permission bypass host ownership", async () => {
		const query = {
			where: vi.fn().mockReturnThis(),
			andWhere: vi.fn().mockReturnThis(),
			first: vi.fn().mockResolvedValue({ id: 7, owner_user_id: 22 }),
		};
		mocks.proxyHostQuery.mockReturnValue(query);
		const access = {
			can: vi.fn().mockResolvedValue({ permission_analytics: "view", permission_visibility: "user" }),
			token: { getUserId: vi.fn().mockReturnValue(11) },
		};
		const service = new AnalyticsService("/tmp/unused", { spool: createSpool() });

		await expect(service.assertHostAccess(access, 7)).rejects.toThrow(/permission/);
		expect(access.can).toHaveBeenCalledWith("analytics:list");
	});

	it("allows the owner or an unrestricted role to inspect a host", async () => {
		const host = { id: 7, owner_user_id: 22 };
		mocks.proxyHostQuery.mockReturnValue({
			where: vi.fn().mockReturnThis(),
			andWhere: vi.fn().mockReturnThis(),
			first: vi.fn().mockResolvedValue(host),
		});
		const service = new AnalyticsService("/tmp/unused", { spool: createSpool() });
		const owner = {
			can: vi.fn().mockResolvedValue({ permission_visibility: "user" }),
			token: { getUserId: vi.fn().mockReturnValue(22) },
		};
		const administrator = {
			can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
			token: { getUserId: vi.fn().mockReturnValue(1) },
		};

		await expect(service.assertHostAccess(owner, 7)).resolves.toBe(host);
		await expect(service.assertHostAccess(administrator, 7)).resolves.toBe(host);
	});
});
