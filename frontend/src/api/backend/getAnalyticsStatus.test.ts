import { describe, expect, it, vi } from "vitest";
import { getAnalyticsStatus } from "./getAnalyticsStatus";

const api = vi.hoisted(() => ({
	get: vi.fn(),
}));

vi.mock("./base", () => ({
	get: api.get,
}));

describe("getAnalyticsStatus", () => {
	it("uses the shared API client so live-status requests follow authenticated response handling", async () => {
		const status = { rxSec: 1024, totalSec: 3072, txSec: 2048 };
		api.get.mockResolvedValue(status);

		await expect(getAnalyticsStatus()).resolves.toEqual(status);
		expect(api.get).toHaveBeenCalledWith({ url: "/analytics/status" });
	});
});
