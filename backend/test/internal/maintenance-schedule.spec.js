import dayjs from "dayjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), configure: vi.fn(), reload: vi.fn() }));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: mocks.query } }));
vi.mock("../../internal/nginx.js", () => ({
	default: { configure: mocks.configure, reload: mocks.reload, withConfigurationLock: (callback) => callback() },
}));

import maintenance from "../../internal/maintenance.js";

function setup(host) {
	const patch = vi.fn().mockResolvedValue(1);
	const graph = vi.fn().mockResolvedValue(host);
	mocks.query.mockReturnValueOnce({ where: () => ({ andWhere: async () => [host] }) });
	mocks.query.mockReturnValue({ findById: () => ({ patch, withGraphFetched: graph }) });
	return { patch, graph };
}
describe("maintenance schedules", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-09-01T12:00:00Z"));
		maintenance.intervalProcessing = false;
		maintenance.scheduledTimers.clear();
	});
	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});
	it("starts at the exact scheduled instant and loads full access rules", async () => {
		const { patch, graph } = setup({
			id: 1,
			enabled: 1,
			maintenance_start: "2026-09-01T12:00:00Z",
			maintenance_active: false,
		});
		await maintenance.processMaintenance();
		expect(patch).toHaveBeenCalledWith({ maintenance_active: 1, maintenance_start: null });
		expect(graph).toHaveBeenCalledWith("[owner, host_domains, access_list.[items, clients], certificate]");
		expect(mocks.configure).toHaveBeenCalledTimes(1);
	});
	it("does not recreate the config of a disabled host", async () => {
		const { patch } = setup({
			id: 1,
			enabled: 0,
			maintenance_start: "2026-09-01T11:00:00Z",
			maintenance_active: false,
		});
		await maintenance.processMaintenance();
		expect(patch).toHaveBeenCalled();
		expect(mocks.configure).not.toHaveBeenCalled();
		expect(mocks.reload).not.toHaveBeenCalled();
	});
	it("keeps end-only manual maintenance active until its scheduled end", async () => {
		const { patch } = setup({
			id: 1,
			enabled: 1,
			maintenance_end: "2026-09-01T13:00:00Z",
			maintenance_active: true,
		});
		await maintenance.processMaintenance();
		expect(patch).not.toHaveBeenCalled();
	});
	it("does not overflow Node's timer limit for distant future dates", () => {
		maintenance.scheduleTimers(1, dayjs().add(40, "days"), dayjs().add(41, "days"));
		expect(vi.getTimerCount()).toBe(0);
	});
});
