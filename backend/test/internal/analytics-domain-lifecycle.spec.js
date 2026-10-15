import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ hosts: vi.fn(), tail: vi.fn(), unwatch: vi.fn(), error: vi.fn() }));
vi.mock("node:fs", () => ({ default: { openSync: vi.fn(() => 1), closeSync: vi.fn() } }));
vi.mock("tail", () => ({
	Tail: class {
		constructor() {
			mocks.tail();
		}
		on() {
			return this;
		}
		unwatch() {
			mocks.unwatch();
		}
	},
}));
vi.mock("../../logger.js", () => ({ analytics: { info: vi.fn(), error: mocks.error } }));
vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: () => ({ where: () => ({ select: () => ({ withGraphFetched: mocks.hosts }) }) }),
	},
}));
const retentionQuery = () => ({ where: () => ({ delete: async () => 0 }) });
vi.mock("../../models/analytics_logs.js", () => ({ default: { query: () => retentionQuery() } }));
vi.mock("../../models/analytic_count.js", () => ({ default: { query: () => retentionQuery() } }));

import { AnalyticsService } from "../../internal/analytics.js";
import { notifyProxyHostDomainsChanged } from "../../lib/proxy-host-domain-events.js";

const deferred = () => {
	let resolve;
	const promise = new Promise((done) => {
		resolve = done;
	});
	return { promise, resolve };
};
const host = (id, domain) => ({ id, domain_names: [domain] });

describe("analytics committed domain changes and lifecycle", () => {
	let service;
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		mocks.hosts.mockReset().mockResolvedValue([host(1, "old.example.test")]);
		service = new AnalyticsService();
	});
	afterEach(async () => {
		// These tests cover domain state, not database ingestion.
		service.detailedLogBuffer = [];
		service.aggregationBuffer.clear();
		await service.stop();
		vi.useRealTimers();
	});

	it("attributes new, renamed and removed hosts immediately after committed notifications", async () => {
		await service.init();
		mocks.hosts.mockResolvedValue([host(2, "NEW.example.test")]);
		await notifyProxyHostDomainsChanged();
		expect(service.hostCache.has("old.example.test")).toBe(false);
		service.processLine(JSON.stringify({ server_name: "new.example.test", status: 200 }));
		expect(service.detailedLogBuffer[0].host_id).toBe(2);
		mocks.hosts.mockResolvedValue([]);
		await notifyProxyHostDomainsChanged();
		expect(service.hostCache.size).toBe(0);
	});

	it("coalesces simultaneous notifications and rereads a snapshot invalidated during a query", async () => {
		await service.init();
		const slow = deferred();
		mocks.hosts.mockImplementationOnce(() => slow.promise).mockResolvedValue([host(3, "current.example.test")]);
		const pending = service.loadDomains();
		const changes = [notifyProxyHostDomainsChanged(), notifyProxyHostDomainsChanged()];
		await Promise.resolve();
		slow.resolve([host(2, "stale.example.test")]);
		await Promise.all([pending, ...changes]);
		expect(service.hostCache.get("current.example.test")).toBe(3);
		expect(service.hostCache.has("stale.example.test")).toBe(false);
		expect(mocks.hosts).toHaveBeenCalledTimes(3);
	});

	it("releases every interval and subscription across two start-stop cycles", async () => {
		for (let cycle = 0; cycle < 2; cycle++) {
			await service.init();
			expect(vi.getTimerCount()).toBe(3);
			await service.stop();
			expect(vi.getTimerCount()).toBe(0);
			const calls = mocks.hosts.mock.calls.length;
			await notifyProxyHostDomainsChanged();
			expect(mocks.hosts.mock.calls.length).toBe(calls);
		}
		expect(mocks.unwatch).toHaveBeenCalledTimes(2);
	});

	it("refreshes a change arriving after read completion but before the shared promise settles", async () => {
		await service.init();
		const slow = deferred();
		mocks.hosts.mockImplementationOnce(() => slow.promise).mockResolvedValue([host(3, "current.example.test")]);
		const pending = service.loadDomains();
		slow.resolve([host(2, "stale.example.test")]);
		// Both tasks enter the microtask queue in this turn; publication runs first.
		const change = notifyProxyHostDomainsChanged();
		await Promise.all([pending, change]);
		expect(service.hostCache.get("current.example.test")).toBe(3);
		expect(service.hostCache.has("stale.example.test")).toBe(false);
		expect(mocks.hosts).toHaveBeenCalledTimes(3);
	});

	it("does not publish a late read from a stopped service over its restarted cache", async () => {
		await service.init();
		const slow = deferred();
		mocks.hosts.mockImplementationOnce(() => slow.promise);
		const pending = service.loadDomains();
		await service.stop();
		mocks.hosts.mockResolvedValue([host(9, "restart.example.test")]);
		await service.init();
		slow.resolve([host(8, "stopped.example.test")]);
		await pending;
		expect(service.hostCache.get("restart.example.test")).toBe(9);
		expect(service.hostCache.has("stopped.example.test")).toBe(false);
	});

	it("does not recreate a tail or timers when stopped during initialization", async () => {
		const slow = deferred();
		mocks.hosts.mockImplementationOnce(() => slow.promise);
		const starting = service.init();
		await service.stop();
		slow.resolve([host(8, "stopped.example.test")]);
		await starting;
		expect(service.isInitialized).toBe(false);
		expect(mocks.tail).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("restarts immediately while an initialization from the stopped generation is still pending", async () => {
		const slow = deferred();
		mocks.hosts.mockImplementationOnce(() => slow.promise);
		const starting = service.init();
		await service.stop();
		mocks.hosts.mockResolvedValue([host(9, "restart.example.test")]);
		await service.init();
		expect(service.isInitialized).toBe(true);
		expect(mocks.tail).toHaveBeenCalledTimes(1);
		slow.resolve([host(8, "stale.example.test")]);
		await starting;
		expect(service.isInitialized).toBe(true);
		expect(service.hostCache.get("restart.example.test")).toBe(9);
		expect(service.hostCache.has("stale.example.test")).toBe(false);
		expect(vi.getTimerCount()).toBe(3);
	});

	it("preserves the last cache on a failed refresh and retries the next committed change", async () => {
		await service.init();
		mocks.hosts.mockRejectedValueOnce(new Error("database unavailable"));
		await expect(notifyProxyHostDomainsChanged()).resolves.toBeUndefined();
		expect(service.hostCache.get("old.example.test")).toBe(1);
		mocks.hosts.mockResolvedValue([host(4, "recovered.example.test")]);
		await notifyProxyHostDomainsChanged();
		expect(service.hostCache.get("recovered.example.test")).toBe(4);
	});
});
