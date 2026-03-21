import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";

vi.mock("node:https", () => ({
	default: {
		get: vi.fn((_url, _opts, cb) => {
			const res = {
				setEncoding: vi.fn(),
				on: vi.fn((event, handler) => {
					if (event === "data") handler("1.1.1.0/24\n2.2.2.0/24\n");
					if (event === "end") handler();
				}),
			};
			cb(res);
			return { on: vi.fn() };
		}),
	},
}));

vi.mock("proxy-agent", () => ({
	ProxyAgent: class ProxyAgent { },
}));

vi.mock("../../lib/error.js", () => {
	class ConfigurationError extends Error {
		constructor(m) { super(m); this.name = "ConfigurationError"; }
	}
	return { default: { ConfigurationError } };
});

vi.mock("../../lib/utils.js", () => ({
	default: {
		getRenderEngine: vi.fn(() => ({
			parseAndRender: vi.fn((_template, data) => {
				return Promise.resolve((data.ip_ranges || []).map((ip) => `set_real_ip_from ${ip};`).join("\n"));
			}),
		})),
	},
}));

vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
	ipRanges: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), fatal: vi.fn() },
}));

vi.mock("../nginx/service.js", () => ({
	default: { reload: vi.fn().mockResolvedValue() },
}));

import ipRangesService from "../../modules/ip-ranges/service.js";

describe("ip-ranges module", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
		ipRangesService.interval_processing = false;
		ipRangesService.iteration_count = 0;
	});

	describe("generateConfig", () => {
		it("should generate config from IP ranges", async () => {
			vi.spyOn(fs.promises, "readFile").mockResolvedValue("template");
			vi.spyOn(fs.promises, "writeFile").mockResolvedValue();
			const result = await ipRangesService.generateConfig(["1.1.1.0/24", "2.2.2.0/24"]);
			expect(result).toBe(true);
		});

		it("should handle empty IP ranges", async () => {
			vi.spyOn(fs.promises, "readFile").mockResolvedValue("template");
			vi.spyOn(fs.promises, "writeFile").mockResolvedValue();
			const result = await ipRangesService.generateConfig([]);
			expect(result).toBe(true);
		});

		it("should throw ConfigurationError on template read failure", async () => {
			vi.spyOn(fs.promises, "readFile").mockRejectedValue(new Error("ENOENT"));
			await expect(ipRangesService.generateConfig(["1.1.1.0/24"])).rejects.toMatchObject({
				name: "ConfigurationError",
			});
		});
	});

	describe("fetchUrl", () => {
		it("should fetch and return raw data", async () => {
			const result = await ipRangesService.fetchUrl("https://example.com/ips");
			expect(result).toContain("1.1.1.0/24");
		});
	});

	describe("initTimer", () => {
		it("should set interval", () => {
			vi.useFakeTimers();
			ipRangesService.initTimer();
			expect(ipRangesService.interval).not.toBeNull();
			clearInterval(ipRangesService.interval);
			vi.useRealTimers();
		});
	});

	describe("interval_timeout", () => {
		it("should be a number", () => {
			expect(typeof ipRangesService.interval_timeout).toBe("number");
		});
	});
});
