import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dayjs", () => {
	const fakeDayjs = (val) => {
		const d = val ? new Date(val) : new Date("2024-06-15T12:00:00Z");
		return {
			isBefore: vi.fn((other) => d < new Date(other)),
			isAfter: vi.fn((other) => d > new Date(other)),
			diff: vi.fn(() => 60000),
			toISOString: vi.fn(() => d.toISOString()),
			startOf: vi.fn(() => fakeDayjs(val)),
			subtract: vi.fn(() => fakeDayjs(val)),
		};
	};
	fakeDayjs.default = fakeDayjs;
	return { default: fakeDayjs };
});

vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: vi.fn(() => mockProxyHostQuery),
	},
}));

vi.mock("../../modules/nginx/index.js", () => ({
	nginxService: {
		configure: vi.fn().mockResolvedValue(),
		reload: vi.fn().mockResolvedValue(),
	},
}));

const mockProxyHostQuery = {
	where: vi.fn().mockReturnThis(),
	andWhere: vi.fn().mockReturnThis(),
	whereNotNull: vi.fn().mockReturnThis(),
	orWhereNotNull: vi.fn().mockReturnThis(),
	findById: vi.fn().mockReturnThis(),
	patch: vi.fn().mockResolvedValue(1),
	withGraphFetched: vi.fn().mockResolvedValue({ id: 1 }),
};

import { maintenanceState } from "../../modules/maintenance/state.js";

describe("maintenance module", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		maintenanceState.intervalProcessing = false;
		maintenanceState.scheduledTimers.clear();
		if (maintenanceState.interval) {
			clearInterval(maintenanceState.interval);
			maintenanceState.interval = null;
		}
	});

	describe("maintenanceState", () => {
		it("should have correct initial state", () => {
			expect(maintenanceState.interval).toBeNull();
			expect(maintenanceState.intervalProcessing).toBe(false);
			expect(maintenanceState.scheduledTimers).toBeInstanceOf(Map);
			expect(maintenanceState.scheduledTimers.size).toBe(0);
		});

		it("should allow setting intervalProcessing", () => {
			maintenanceState.intervalProcessing = true;
			expect(maintenanceState.intervalProcessing).toBe(true);
		});

		it("should allow storing timers in scheduledTimers", () => {
			const timer = setTimeout(() => {}, 1000);
			maintenanceState.scheduledTimers.set("host_1", [timer]);
			expect(maintenanceState.scheduledTimers.has("host_1")).toBe(true);
			clearTimeout(timer);
		});

		it("should clear scheduled timers", () => {
			maintenanceState.scheduledTimers.set("host_1", []);
			maintenanceState.scheduledTimers.set("host_2", []);
			maintenanceState.scheduledTimers.clear();
			expect(maintenanceState.scheduledTimers.size).toBe(0);
		});

		it("should remove specific timer key", () => {
			maintenanceState.scheduledTimers.set("host_1", []);
			maintenanceState.scheduledTimers.set("host_2", []);
			maintenanceState.scheduledTimers.delete("host_1");
			expect(maintenanceState.scheduledTimers.has("host_1")).toBe(false);
			expect(maintenanceState.scheduledTimers.has("host_2")).toBe(true);
		});
	});
});
