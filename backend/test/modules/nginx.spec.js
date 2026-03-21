import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock fs
vi.mock("node:fs", () => ({
	default: {
		promises: {
			access: vi.fn().mockResolvedValue(),
			unlink: vi.fn().mockResolvedValue(),
			rename: vi.fn().mockResolvedValue(),
			copyFile: vi.fn().mockResolvedValue(),
			writeFile: vi.fn().mockResolvedValue(),
		},
	},
	promises: {
		access: vi.fn().mockResolvedValue(),
		unlink: vi.fn().mockResolvedValue(),
		rename: vi.fn().mockResolvedValue(),
		copyFile: vi.fn().mockResolvedValue(),
		writeFile: vi.fn().mockResolvedValue(),
	},
}));

vi.mock("../../lib/utils.js", () => ({
	default: {
		execFile: vi.fn().mockResolvedValue("ok"),
		getRenderEngine: vi.fn(() => ({
			renderFile: vi.fn().mockResolvedValue("# generated config"),
		})),
	},
}));

vi.mock("../../logger.js", () => ({
	nginx: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), success: vi.fn() },
	debug: vi.fn(),
}));

vi.mock("../../lib/error.js", () => ({
	default: {
		ConfigurationError: class ConfigurationError extends Error {
			constructor(m) {
				super(m);
				this.name = "ConfigurationError";
			}
		},
	},
}));

vi.mock("../../modules/anubis/service.js", () => ({
	default: { generatePolicy: vi.fn() },
}));

vi.mock("lodash", () => ({
	default: {
		assign: Object.assign,
		map: (arr, fn) => arr.map(fn),
		omit: (obj, keys) => {
			const result = { ...obj };
			for (const k of keys) {
				delete result[k];
			}
			return result;
		},
	},
}));

vi.mock("dayjs", () => {
	const d = () => ({ isAfter: vi.fn(), isBefore: vi.fn() });
	d.extend = vi.fn();
	return { default: d };
});

vi.mock("punycode.js", () => ({
	default: { toASCII: vi.fn((d) => d) },
}));

vi.mock("../../modules/nginx/render.js", () => ({
	generateConfig: vi.fn().mockResolvedValue(true),
	renderLocations: vi.fn().mockResolvedValue(""),
}));

import {
	advancedConfigHasDefaultLocation,
	getConfigName,
	getFileFriendlyHostType,
} from "../../modules/nginx/helpers.js";

describe("nginx module", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── helpers ──────────────────────────────────────────────────────────

	describe("getFileFriendlyHostType", () => {
		it("should replace hyphens with underscores", () => {
			expect(getFileFriendlyHostType("proxy-host")).toBe("proxy_host");
		});

		it("should leave strings without hyphens unchanged", () => {
			expect(getFileFriendlyHostType("stream")).toBe("stream");
		});

		it("should handle multiple hyphens", () => {
			expect(getFileFriendlyHostType("dead-host-type")).toBe("dead_host_type");
		});
	});

	describe("getConfigName", () => {
		it("should return default.conf for default host type", () => {
			const result = getConfigName("default", 0);
			expect(result).toBe("/usr/local/nginx/conf/conf.d/default.conf");
		});

		it("should return path under /data/nginx for non-default types", () => {
			const result = getConfigName("proxy_host", 5);
			expect(result).toBe("/data/nginx/proxy_host/5.conf");
		});

		it("should handle stream type", () => {
			const result = getConfigName("stream", 42);
			expect(result).toBe("/data/nginx/stream/42.conf");
		});
	});

	describe("advancedConfigHasDefaultLocation", () => {
		it("should return true when config has location / block", () => {
			expect(advancedConfigHasDefaultLocation("location / {\n  proxy_pass http://localhost;\n}")).toBe(true);
		});

		it("should return false for empty config", () => {
			expect(advancedConfigHasDefaultLocation("")).toBe(false);
		});

		it("should return false for config without root location", () => {
			expect(advancedConfigHasDefaultLocation("location /api {\n  proxy_pass http://api;\n}")).toBe(false);
		});

		it("should match multiline advanced configs with location /", () => {
			const cfg = "# some comment\nproxy_set_header X-Real-IP $remote_addr;\nlocation / {";
			expect(advancedConfigHasDefaultLocation(cfg)).toBe(true);
		});

		it("should handle location / preceded by semicolon on same line", () => {
			const cfg = "proxy_pass http://x; location / {";
			expect(advancedConfigHasDefaultLocation(cfg)).toBe(true);
		});
	});

	// ── files (deleteFile, backupConfig, etc.) ──────────────────────────

	describe("deleteConfig", () => {
		it("should call fs unlink for config and .err file", async () => {
			const { deleteConfig } = await import("../../modules/nginx/files.js");
			const fs = await import("node:fs");
			await deleteConfig("proxy_host", { id: 3 });
			expect(fs.default.promises.unlink).toHaveBeenCalled();
		});
	});

	describe("backupConfig", () => {
		it("should copy config to .bak file", async () => {
			const { backupConfig } = await import("../../modules/nginx/files.js");
			const fs = await import("node:fs");
			await backupConfig("proxy_host", { id: 3 });
			expect(fs.default.promises.copyFile).toHaveBeenCalled();
		});
	});

	// ── runtime ─────────────────────────────────────────────────────────

	describe("test", () => {
		it("should execute nginx -tq", async () => {
			const { test } = await import("../../modules/nginx/runtime.js");
			const utils = (await import("../../lib/utils.js")).default;
			await test();
			expect(utils.execFile).toHaveBeenCalledWith("nginx", ["-tq"]);
		});
	});
});
