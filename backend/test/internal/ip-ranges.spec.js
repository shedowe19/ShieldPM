import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/nginx.js", () => ({
	default: { reload: vi.fn(), withConfigurationLock: vi.fn((callback) => callback()) },
}));

import ranges from "../../internal/ip_ranges.js";
import nginx from "../../internal/nginx.js";

afterEach(() => {
	ranges.stop();
	vi.restoreAllMocks();
	vi.useRealTimers();
	vi.unstubAllEnvs();
	ranges.interval_processing = false;
	ranges.iteration_count = 0;
});
describe("Cloudflare IP ranges", () => {
	it.each(["-1", "0", "100", "Infinity", "2.5", "invalid"])(
		"ignores removed IPRT=%s when applying the saved refresh interval",
		async (value) => {
			vi.stubEnv("IPRT", value);
			await ranges.configure({ enabled: false, refresh_interval_hours: 12 });
			expect(ranges.interval_timeout).toBe(12 * 60 * 60 * 1000);
			expect(ranges.interval).toBeNull();
		},
	);
	it("preserves both IPv4 and IPv6 networks", async () => {
		vi.spyOn(ranges, "fetchUrl")
			.mockResolvedValueOnce("173.245.48.0/20\n")
			.mockResolvedValueOnce("2400:cb00::/32\n2606:4700::/32\n");
		const generate = vi.spyOn(ranges, "generateConfig").mockResolvedValue(true);
		await ranges.fetch();
		expect(generate).toHaveBeenCalledWith(
			["173.245.48.0/20", "2400:cb00::/32", "2606:4700::/32"],
			expect.any(Function),
		);
	});
	it("waits for in-progress Nginx changes before publishing refreshed ranges", async () => {
		let release;
		const gate = new Promise((resolve) => {
			release = resolve;
		});
		nginx.withConfigurationLock.mockImplementationOnce((callback) => gate.then(callback));
		vi.spyOn(ranges, "fetchUrl").mockResolvedValueOnce("173.245.48.0/20").mockResolvedValueOnce("2400:cb00::/32");
		const generate = vi.spyOn(ranges, "generateConfig").mockResolvedValue(true);
		const pending = ranges.fetch();
		await Promise.resolve();
		await Promise.resolve();
		expect(generate).not.toHaveBeenCalled();
		release();
		await pending;
		expect(generate).toHaveBeenCalledOnce();
	});
	it.each(["", "<html>Service unavailable</html>", "2400:cb00::/129", "2400:cb00::/32; allow all;"])(
		"retains the prior config on invalid response %s",
		async (response) => {
			vi.spyOn(ranges, "fetchUrl").mockResolvedValueOnce("173.245.48.0/20\n").mockResolvedValueOnce(response);
			const generate = vi.spyOn(ranges, "generateConfig").mockResolvedValue(true);
			await ranges.fetch();
			expect(generate).not.toHaveBeenCalled();
			expect(ranges.interval_processing).toBe(false);
		},
	);
});

describe("live IP range refresh scheduling", () => {
	const hours = (count) => count * 60 * 60 * 1000;
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		ranges.stop();
		ranges.interval_timeout = hours(6);
		ranges.iteration_count = 0;
		vi.spyOn(ranges, "fetchUrl").mockImplementation(async (url) =>
			url.endsWith("ips-v4") ? "173.245.48.0/20" : "2400:cb00::/32",
		);
		vi.spyOn(ranges, "generateConfig").mockResolvedValue(true);
	});

	it("enables a future timer and immediately fetches and reloads the first live update", async () => {
		await ranges.configure({ enabled: true, refresh_interval_hours: 6 });
		await ranges.fetch();
		expect(ranges.fetchUrl).toHaveBeenCalledTimes(2);
		expect(nginx.reload).toHaveBeenCalledOnce();
		expect(ranges.iteration_count).toBe(1);
		expect(vi.getTimerCount()).toBe(1);
		await vi.advanceTimersByTimeAsync(hours(6));
		expect(ranges.fetchUrl).toHaveBeenCalledTimes(4);
		expect(nginx.reload).toHaveBeenCalledTimes(2);
	});

	it("waits for initial startup fetch without a duplicate reload and reloads subsequent timer refreshes", async () => {
		await ranges.configure({ enabled: true, refresh_interval_hours: 6 }, { startup: true });
		expect(ranges.generateConfig).toHaveBeenCalledOnce();
		expect(nginx.reload).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(hours(6));
		expect(nginx.reload).toHaveBeenCalledOnce();
	});

	it("rearms an enabled timer after an interval change without another immediate fetch", async () => {
		await ranges.configure({ enabled: true, refresh_interval_hours: 6 });
		await ranges.fetch();
		vi.clearAllMocks();
		await ranges.configure({ enabled: true, refresh_interval_hours: 24 });
		expect(ranges.fetchUrl).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(1);
		await vi.advanceTimersByTimeAsync(hours(6));
		expect(ranges.fetchUrl).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(hours(18));
		expect(ranges.fetchUrl).toHaveBeenCalledTimes(2);
	});

	it("supports the maximum saved interval without overflowing Node's timer", async () => {
		await ranges.configure({ enabled: true, refresh_interval_hours: 594 });
		await ranges.fetch();
		vi.clearAllMocks();
		expect(ranges.interval_timeout).toBe(2_138_400_000);
		await vi.advanceTimersByTimeAsync(hours(593));
		expect(ranges.fetchUrl).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(hours(1));
		expect(ranges.fetchUrl).toHaveBeenCalledTimes(2);
	});

	it("stops future refreshes without overwriting known ranges", async () => {
		await ranges.configure({ enabled: true, refresh_interval_hours: 6 });
		await ranges.fetch();
		vi.clearAllMocks();
		await ranges.configure({ enabled: false, refresh_interval_hours: 6 });
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(hours(24));
		expect(ranges.fetchUrl).not.toHaveBeenCalled();
		expect(ranges.generateConfig).not.toHaveBeenCalled();
		expect(nginx.reload).not.toHaveBeenCalled();
	});

	it("invalidates an already running network request when refresh is disabled", async () => {
		let resolveIpv4;
		ranges.fetchUrl.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveIpv4 = resolve;
				}),
		);
		await ranges.configure({ enabled: true, refresh_interval_hours: 6 });
		const fetching = ranges.fetch();
		await ranges.configure({ enabled: false, refresh_interval_hours: 6 });
		resolveIpv4("173.245.48.0/20");
		await fetching;
		expect(ranges.fetchUrl).toHaveBeenCalledOnce();
		expect(ranges.generateConfig).not.toHaveBeenCalled();
		expect(nginx.reload).not.toHaveBeenCalled();
		expect(ranges.iteration_count).toBe(0);
	});

	it("discards publication waiting for the Nginx lock after disable", async () => {
		let releaseLock;
		const lock = new Promise((resolve) => {
			releaseLock = resolve;
		});
		nginx.withConfigurationLock.mockImplementationOnce((callback) => lock.then(callback));
		await ranges.configure({ enabled: true, refresh_interval_hours: 6 });
		const fetching = ranges.fetch();
		await Promise.resolve();
		await Promise.resolve();
		await ranges.configure({ enabled: false, refresh_interval_hours: 6 });
		releaseLock();
		await fetching;
		expect(ranges.generateConfig).not.toHaveBeenCalled();
		expect(nginx.reload).not.toHaveBeenCalled();
	});

	it("waits for an active publication barrier and cancels its pending reload when disabled", async () => {
		let releaseRender;
		const render = new Promise((resolve) => {
			releaseRender = resolve;
		});
		let queue = Promise.resolve();
		nginx.withConfigurationLock.mockImplementation((callback) => {
			const operation = queue.then(callback);
			queue = operation.catch(() => {});
			return operation;
		});
		ranges.generateConfig.mockImplementationOnce(async (_ranges, isCurrent) => {
			await render;
			return isCurrent();
		});
		await ranges.configure({ enabled: true, refresh_interval_hours: 6 });
		const fetching = ranges.fetch();
		for (let index = 0; index < 5; index++) await Promise.resolve();
		expect(ranges.generateConfig).toHaveBeenCalledOnce();
		let disabled = false;
		const disabling = ranges.configure({ enabled: false, refresh_interval_hours: 6 }).then(() => {
			disabled = true;
		});
		await Promise.resolve();
		expect(disabled).toBe(false);
		releaseRender();
		await Promise.all([fetching, disabling]);
		expect(disabled).toBe(true);
		expect(nginx.reload).not.toHaveBeenCalled();
		expect(ranges.iteration_count).toBe(0);
	});

	it("performs a fresh immediate fetch if re-enabled before an obsolete request finishes", async () => {
		let resolveIpv4;
		ranges.fetchUrl.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveIpv4 = resolve;
				}),
		);
		await ranges.configure({ enabled: true, refresh_interval_hours: 6 });
		const obsolete = ranges.fetch();
		await ranges.configure({ enabled: false, refresh_interval_hours: 6 });
		await ranges.configure({ enabled: true, refresh_interval_hours: 6 });
		resolveIpv4("173.245.48.0/20");
		await obsolete;
		await ranges.fetch();
		expect(ranges.fetchUrl).toHaveBeenCalledTimes(3);
		expect(ranges.generateConfig).toHaveBeenCalledOnce();
		expect(nginx.reload).toHaveBeenCalledOnce();
	});
});
