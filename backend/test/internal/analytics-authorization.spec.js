import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("../../models/proxy_host.js", () => ({ default: { query } }));
vi.mock("../../models/analytic_count.js", () => ({ default: {} }));
vi.mock("../../models/analytics_logs.js", () => ({ default: {} }));

import { AnalyticsService } from "../../internal/analytics.js";
import errs from "../../lib/error.js";

describe("host analytics authorization", () => {
	const host = { id: 7, owner_user_id: 2 };
	let access;
	beforeEach(() => {
		const builder = { where: vi.fn(), andWhere: vi.fn(), first: vi.fn().mockResolvedValue(host) };
		builder.where.mockReturnValue(builder);
		builder.andWhere.mockReturnValue(builder);
		query.mockReturnValue(builder);
		access = { can: vi.fn(), token: { getUserId: () => 2, hasScope: () => true } };
	});

	it("rejects an owner with a stale admin scope when current permissions are denied", async () => {
		access.can.mockRejectedValue(new errs.PermissionError());
		await expect(new AnalyticsService().assertHostAccess(access, 7)).rejects.toBeInstanceOf(errs.PermissionError);
	});

	it("allows an authorized own-host reader without global analytics", async () => {
		access.can.mockRejectedValueOnce(new errs.PermissionError()).mockResolvedValue({ roles: ["user"] });
		await expect(new AnalyticsService().assertHostAccess(access, 7)).resolves.toBe(host);
		expect(access.can).toHaveBeenLastCalledWith("proxy_hosts:get", 7);
	});

	it("does not treat proxy read permission as ownership of another user's host", async () => {
		access.token.getUserId = () => 9;
		access.can.mockRejectedValueOnce(new errs.PermissionError()).mockResolvedValue({ roles: ["user"] });
		await expect(new AnalyticsService().assertHostAccess(access, 7)).rejects.toBeInstanceOf(errs.PermissionError);
	});

	it("allows global analytics permission regardless of host ownership", async () => {
		access.token.getUserId = () => 9;
		access.can.mockResolvedValue({ permission_analytics: "view" });
		await expect(new AnalyticsService().assertHostAccess(access, 7)).resolves.toBe(host);
		expect(access.can).toHaveBeenCalledTimes(1);
	});

	it("does not hide unexpected authorization failures with an ownership fallback", async () => {
		const failure = new Error("database unavailable");
		access.can.mockRejectedValue(failure);
		await expect(new AnalyticsService().assertHostAccess(access, 7)).rejects.toBe(failure);
		expect(access.can).toHaveBeenCalledTimes(1);
	});
});
