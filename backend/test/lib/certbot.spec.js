import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../logger.js", () => ({
	certbot: { start: vi.fn(), complete: vi.fn(), error: vi.fn() },
}));

vi.mock("../../lib/utils.js", () => ({
	default: {
		execFile: vi.fn(),
	},
}));

vi.mock("../../lib/error.js", () => {
	class ItemNotFoundError extends Error {
		constructor(msg) {
			super(`Not Found - ${msg}`);
			this.name = "ItemNotFoundError";
		}
	}
	class CommandError extends Error {
		constructor(msg, code) {
			super(msg);
			this.name = "CommandError";
			this.code = code;
		}
	}
	return {
		default: { ItemNotFoundError, CommandError },
	};
});

const { installPlugin, installPlugins } = await import("../../lib/certbot.js");
const utils = (await import("../../lib/utils.js")).default;

describe("certbot", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("installPlugin", () => {
		it("calls pip install for a valid plugin key", async () => {
			utils.execFile.mockResolvedValue("ok");
			// "acmedns" is a known plugin key in dns-plugins.json
			await installPlugin("acmedns");
			expect(utils.execFile).toHaveBeenCalledWith("pip", [
				"install",
				"--upgrade",
				"--no-cache-dir",
				"certbot-dns-acmedns",
			]);
		});

		it("throws ItemNotFoundError for unknown plugin key", async () => {
			await expect(installPlugin("nonexistent_plugin_xyz")).rejects.toThrow("Not Found");
		});
	});

	describe("installPlugins", () => {
		it("does nothing for empty array", async () => {
			await installPlugins([]);
			expect(utils.execFile).not.toHaveBeenCalled();
		});

		it("installs multiple plugins", async () => {
			utils.execFile.mockResolvedValue("ok");
			await installPlugins(["acmedns"]);
			expect(utils.execFile).toHaveBeenCalledTimes(1);
		});

		it("throws CommandError when a plugin fails", async () => {
			utils.execFile.mockRejectedValue(new Error("pip failed"));
			await expect(installPlugins(["acmedns"])).rejects.toThrow("Some plugins failed");
		});
	});
});
