import { describe, expect, it, vi } from "vitest";
import { getDbStats } from "./getDbStats";

const api = vi.hoisted(() => ({
	get: vi.fn(),
}));

vi.mock("./base", () => ({
	get: api.get,
}));

describe("getDbStats", () => {
	it("uses the shared API client so database-stat requests follow authenticated response handling", async () => {
		const dbStats = {
			connections: { max: 10, open: 1, used: 1 },
			engine: "sqlite",
			io: { reads: 2, writes: 3 },
			size: 1024,
		};
		api.get.mockResolvedValue(dbStats);

		await expect(getDbStats()).resolves.toEqual(dbStats);
		expect(api.get).toHaveBeenCalledWith({ url: "/analytics/db-stats" });
	});
});
