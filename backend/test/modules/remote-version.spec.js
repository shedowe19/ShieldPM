import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:https", () => ({
	default: {
		get: vi.fn((_url, _opts, cb) => {
			const res = {
				setEncoding: vi.fn(),
				on: vi.fn((event, handler) => {
					if (event === "data") handler('{"tag_name":"v1.0.0"}');
					if (event === "end") handler();
				}),
			};
			cb(res);
			return { on: vi.fn() };
		}),
	},
}));

vi.mock("proxy-agent", () => ({
	ProxyAgent: class ProxyAgent {
	},
}));

vi.mock("../../logger.js", () => ({
	remoteVersion: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../package.json", () => ({
	default: { version: "1.0.0" },
}));

import remoteVersionService from "../../modules/remote-version/service.js";

describe("remote-version module", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		remoteVersionService.last_result = null;
		remoteVersionService.last_fetch_time = null;
	});

	describe("fetchUrl", () => {
		it("should fetch and return raw data", async () => {
			const result = await remoteVersionService.fetchUrl("https://api.github.com/test");
			expect(result).toContain("tag_name");
		});
	});

	describe("get", () => {
		it("should return version info with current and latest", async () => {
			const result = await remoteVersionService.get();
			expect(result).toHaveProperty("current");
			expect(result).toHaveProperty("latest");
			expect(result).toHaveProperty("update_available");
		});

		it("should cache the result", async () => {
			await remoteVersionService.get();
			expect(remoteVersionService.last_result).not.toBeNull();
			expect(remoteVersionService.last_fetch_time).not.toBeNull();
		});

		it("should use cache on subsequent calls", async () => {
			const result1 = await remoteVersionService.get();
			const result2 = await remoteVersionService.get();
			expect(result1).toEqual(result2);
		});

		it("should report no update when versions match", async () => {
			const result = await remoteVersionService.get();
			expect(result.update_available).toBe(false);
		});
	});

	describe("cache_timeout", () => {
		it("should be 24 hours in ms", () => {
			expect(remoteVersionService.cache_timeout).toBe(86400000);
		});
	});
});
