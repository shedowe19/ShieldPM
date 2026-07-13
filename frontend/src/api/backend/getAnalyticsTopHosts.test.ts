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
		api.get.mockResolvedValue([{ domain_name: "api.example", id: 7, requests: 42, server_errors: 3 }]);

		await expect(getAnalyticsTopHosts()).resolves.toEqual([
			{ bytes: 0, clientErrors: 0, domainName: "api.example", id: 7, requests: 42, serverErrors: 3 },
		]);
		expect(api.get).toHaveBeenCalledWith({ url: "/analytics/top-hosts" });
	});

	it("requests the server-error ranking through a separate protected aggregate query", async () => {
		api.get.mockResolvedValue([{ domain_name: "api.example", id: 7, requests: 42, server_errors: 3 }]);

		await expect(getAnalyticsTopHosts("server_errors")).resolves.toEqual([
			{ bytes: 0, clientErrors: 0, domainName: "api.example", id: 7, requests: 42, serverErrors: 3 },
		]);
		expect(api.get).toHaveBeenLastCalledWith({ url: "/analytics/top-hosts", params: { sort: "server_errors" } });
	});

	it("requests client-error rankings and normalizes their 4xx aggregate", async () => {
		api.get.mockResolvedValue([
			{ client_errors: 12, domain_name: "api.example", id: 7, requests: 42, server_errors: 3 },
		]);

		await expect(getAnalyticsTopHosts("client_errors")).resolves.toEqual([
			{ bytes: 0, clientErrors: 12, domainName: "api.example", id: 7, requests: 42, serverErrors: 3 },
		]);
		expect(api.get).toHaveBeenLastCalledWith({ url: "/analytics/top-hosts", params: { sort: "client_errors" } });
	});

	it("requests bandwidth rankings and normalizes transferred bytes", async () => {
		api.get.mockResolvedValue([
			{ bytes: "1536", domain_name: "downloads.example", id: 9, requests: 12, server_errors: 0 },
		]);

		await expect(getAnalyticsTopHosts("bytes")).resolves.toEqual([
			{ bytes: 1536, clientErrors: 0, domainName: "downloads.example", id: 9, requests: 12, serverErrors: 0 },
		]);
		expect(api.get).toHaveBeenLastCalledWith({ url: "/analytics/top-hosts", params: { sort: "bytes" } });
	});
});
