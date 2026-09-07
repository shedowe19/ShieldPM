import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/nginx.js", () => ({ default: { reload: vi.fn() } }));

import ranges from "../../internal/ip_ranges.js";

afterEach(() => {
	vi.restoreAllMocks();
	ranges.interval_processing = false;
	ranges.iteration_count = 0;
});
describe("Cloudflare IP ranges", () => {
	it("preserves both IPv4 and IPv6 networks", async () => {
		vi.spyOn(ranges, "fetchUrl")
			.mockResolvedValueOnce("173.245.48.0/20\n")
			.mockResolvedValueOnce("2400:cb00::/32\n2606:4700::/32\n");
		const generate = vi.spyOn(ranges, "generateConfig").mockResolvedValue(true);
		await ranges.fetch();
		expect(generate).toHaveBeenCalledWith(["173.245.48.0/20", "2400:cb00::/32", "2606:4700::/32"]);
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
