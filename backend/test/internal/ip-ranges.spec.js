import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/nginx.js", () => ({
	default: { reload: vi.fn(), withConfigurationLock: vi.fn((callback) => callback()) },
}));

import ranges from "../../internal/ip_ranges.js";
import nginx from "../../internal/nginx.js";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	ranges.interval_processing = false;
	ranges.iteration_count = 0;
});
describe("Cloudflare IP ranges", () => {
	it.each(["-1", "0", "100", "Infinity", "2.5", "invalid"])(
		"prevents Node timer overflow for IPRT=%s",
		async (value) => {
			vi.stubEnv("IPRT", value);
			vi.resetModules();
			const { default: configured } = await import("../../internal/ip_ranges.js");
			expect(configured.interval_timeout).toBe(6 * 60 * 60 * 1000);
		},
	);
	it("preserves both IPv4 and IPv6 networks", async () => {
		vi.spyOn(ranges, "fetchUrl")
			.mockResolvedValueOnce("173.245.48.0/20\n")
			.mockResolvedValueOnce("2400:cb00::/32\n2606:4700::/32\n");
		const generate = vi.spyOn(ranges, "generateConfig").mockResolvedValue(true);
		await ranges.fetch();
		expect(generate).toHaveBeenCalledWith(["173.245.48.0/20", "2400:cb00::/32", "2606:4700::/32"]);
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
