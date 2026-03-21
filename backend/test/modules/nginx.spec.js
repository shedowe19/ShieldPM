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

	// ── files ───────────────────────────────────────────────────────────

	describe("deleteConfig", () => {
		it("should call fs unlink for config and .err file", async () => {
			const { deleteConfig } = await import("../../modules/nginx/files.js");
			const fs = await import("node:fs");
			await deleteConfig("proxy_host", { id: 3 });
			expect(fs.default.promises.unlink).toHaveBeenCalled();
		});

		it("should handle undefined host gracefully", async () => {
			const { deleteConfig } = await import("../../modules/nginx/files.js");
			await expect(deleteConfig("proxy_host", undefined)).resolves.toBeUndefined();
		});
	});

	describe("backupConfig", () => {
		it("should copy config to .bak file", async () => {
			const { backupConfig } = await import("../../modules/nginx/files.js");
			const fs = await import("node:fs");
			await backupConfig("proxy_host", { id: 3 });
			expect(fs.default.promises.copyFile).toHaveBeenCalled();
		});

		it("should not throw when source file doesn't exist", async () => {
			const { backupConfig } = await import("../../modules/nginx/files.js");
			const fs = await import("node:fs");
			fs.default.promises.copyFile.mockRejectedValueOnce({ code: "ENOENT" });
			await expect(backupConfig("proxy_host", { id: 99 })).resolves.toBeUndefined();
		});
	});

	describe("deleteBackupConfig", () => {
		it("should delete the .bak file", async () => {
			const { deleteBackupConfig } = await import("../../modules/nginx/files.js");
			const fs = await import("node:fs");
			await deleteBackupConfig("proxy_host", { id: 3 });
			expect(fs.default.promises.unlink).toHaveBeenCalled();
		});
	});

	describe("renameConfigAsError", () => {
		it("should rename config file to .err", async () => {
			const { renameConfigAsError } = await import("../../modules/nginx/files.js");
			const fs = await import("node:fs");
			await renameConfigAsError("proxy_host", { id: 3 });
			expect(fs.default.promises.rename).toHaveBeenCalled();
		});

		it("should not throw on rename failure", async () => {
			const { renameConfigAsError } = await import("../../modules/nginx/files.js");
			const fs = await import("node:fs");
			fs.default.promises.rename.mockRejectedValueOnce(new Error("fail"));
			await expect(renameConfigAsError("proxy_host", { id: 3 })).resolves.toBeUndefined();
		});
	});

	describe("restoreConfig", () => {
		it("should rename .bak back to config file", async () => {
			const { restoreConfig } = await import("../../modules/nginx/files.js");
			const fs = await import("node:fs");
			await restoreConfig("proxy_host", { id: 3 });
			expect(fs.default.promises.rename).toHaveBeenCalled();
		});

		it("should not throw when backup doesn't exist", async () => {
			const { restoreConfig } = await import("../../modules/nginx/files.js");
			const fs = await import("node:fs");
			fs.default.promises.rename.mockRejectedValueOnce({ code: "ENOENT" });
			await expect(restoreConfig("proxy_host", { id: 3 })).resolves.toBeUndefined();
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

	describe("reload", () => {
		it("should test nginx config then reload", async () => {
			const { reload } = await import("../../modules/nginx/runtime.js");
			const utils = (await import("../../lib/utils.js")).default;
			await reload();
			expect(utils.execFile).toHaveBeenCalledWith("nginx", ["-tq"]);
			expect(utils.execFile).toHaveBeenCalledWith("nginx", ["-s", "reload"]);
		});
	});

	describe("configure", () => {
		it("should generate config, test, and update meta on success", async () => {
			const { configure } = await import("../../modules/nginx/runtime.js");
			const { generateConfig } = await import("../../modules/nginx/render.js");
			const _utils = (await import("../../lib/utils.js")).default;
			const mockModel = {
				query: vi.fn(() => ({ where: vi.fn().mockReturnThis(), patch: vi.fn().mockResolvedValue(1) })),
			};
			const host = { id: 1, meta: {} };
			const result = await configure(mockModel, "proxy_host", host);
			expect(generateConfig).toHaveBeenCalledWith("proxy_host", host);
			expect(result.nginx_online).toBe(true);
		});

		it("should rollback config on nginx test failure", async () => {
			const { configure } = await import("../../modules/nginx/runtime.js");
			const utils = (await import("../../lib/utils.js")).default;
			// First call is backupConfig internal, generateConfig ok, but test fails
			utils.execFile.mockRejectedValueOnce(new Error("nginx test failed"));
			const mockModel = {
				query: vi.fn(() => ({ where: vi.fn().mockReturnThis(), patch: vi.fn().mockResolvedValue(1) })),
			};
			const host = { id: 1, meta: {} };
			const result = await configure(mockModel, "proxy_host", host);
			expect(result.nginx_online).toBe(false);
			expect(result.nginx_err).toContain("Rolled back");
		});

		it("should skip reload when skip_reload option is set", async () => {
			const { configure } = await import("../../modules/nginx/runtime.js");
			const utils = (await import("../../lib/utils.js")).default;
			utils.execFile.mockResolvedValue("ok");
			const mockModel = {
				query: vi.fn(() => ({ where: vi.fn().mockReturnThis(), patch: vi.fn().mockResolvedValue(1) })),
			};
			const host = { id: 1, meta: {} };
			// Track calls before
			utils.execFile.mockClear();
			await configure(mockModel, "proxy_host", host, { skip_reload: true });
			// Should call test but not reload
			const calls = utils.execFile.mock.calls.map((c) => c[1]);
			expect(calls.some((c) => c.includes("-tq"))).toBe(true);
			// Should NOT have called nginx -s reload
			expect(calls.some((c) => c.includes("reload"))).toBe(false);
		});
	});

	describe("bulkGenerateConfigs", () => {
		it("should configure each host with skip_reload", async () => {
			const { bulkGenerateConfigs } = await import("../../modules/nginx/runtime.js");
			const utils = (await import("../../lib/utils.js")).default;
			utils.execFile.mockResolvedValue("ok");
			const mockModel = {
				query: vi.fn(() => ({ where: vi.fn().mockReturnThis(), patch: vi.fn().mockResolvedValue(1) })),
			};
			const hosts = [
				{ id: 1, meta: {} },
				{ id: 2, meta: {} },
			];
			await bulkGenerateConfigs(mockModel, "proxy_host", hosts);
			// Should not throw
		});

		it("should handle empty hosts array", async () => {
			const { bulkGenerateConfigs } = await import("../../modules/nginx/runtime.js");
			const mockModel = { query: vi.fn() };
			await expect(bulkGenerateConfigs(mockModel, "proxy_host", [])).resolves.toBeUndefined();
		});
	});
});
