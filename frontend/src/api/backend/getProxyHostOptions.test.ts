import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "./base";
import { getHostOptions } from "./getProxyHostOptions";

vi.mock("./base", () => ({ get: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe("proxy host selector API", () => {
	it("uses the independent proxy-host endpoint and forwards cancellation", async () => {
		const controller = new AbortController();
		vi.mocked(api.get).mockResolvedValue([{ id: 1, domainNames: ["media.example.test"] }]);
		expect(await getHostOptions(controller.signal)).toEqual([{ id: 1, domainNames: ["media.example.test"] }]);
		expect(api.get).toHaveBeenCalledWith({ url: "/nginx/proxy-hosts/options" }, { signal: controller.signal });
	});
});
