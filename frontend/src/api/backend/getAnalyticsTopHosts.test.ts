import { describe, expect, it, vi } from "vitest";
import { getAnalyticsTopHosts } from "./getAnalyticsTopHosts";

const api = vi.hoisted(() => ({
	get: vi.fn(),
}));

vi.mock("./base", () => ({
	get: api.get,
}));

describe("getAnalyticsTopHosts", () => {
	it("normalizes the protected aggregate's backend field names through the shared API client", async () => {
		api.get.mockResolvedValue([{ domain_name: "api.example", id: 7, requests: 42 }]);

		await expect(getAnalyticsTopHosts()).resolves.toEqual([{ domainName: "api.example", id: 7, requests: 42 }]);
		expect(api.get).toHaveBeenCalledWith({ url: "/analytics/top-hosts" });
	});
});
