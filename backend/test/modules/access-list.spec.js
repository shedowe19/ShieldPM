import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock fs
vi.mock("node:fs", () => ({
	default: {
		promises: {
			unlink: vi.fn().mockResolvedValue(),
			writeFile: vi.fn().mockResolvedValue(),
			appendFile: vi.fn().mockResolvedValue(),
		},
	},
	promises: {
		unlink: vi.fn().mockResolvedValue(),
		writeFile: vi.fn().mockResolvedValue(),
		appendFile: vi.fn().mockResolvedValue(),
	},
}));

vi.mock("bcryptjs", () => ({
	default: {
		hash: vi.fn((pw) => Promise.resolve(`$2a$13$hashed_${pw}`)),
	},
}));

vi.mock("../../logger.js", () => ({
	access: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
	default: { info: vi.fn(), error: vi.fn() },
}));

import { build, getFilename, maskItems, omissions } from "../../modules/access-list/helpers.js";

describe("access-list module – helpers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── omissions ───────────────────────────────────────────────────────

	describe("omissions", () => {
		it("should return array with is_deleted", () => {
			expect(omissions()).toContain("is_deleted");
		});
	});

	// ── getFilename ─────────────────────────────────────────────────────

	describe("getFilename", () => {
		it("should return /data/access/{id}", () => {
			expect(getFilename({ id: 7 })).toBe("/data/access/7");
		});

		it("should handle id 0", () => {
			expect(getFilename({ id: 0 })).toBe("/data/access/0");
		});
	});

	// ── maskItems ───────────────────────────────────────────────────────

	describe("maskItems", () => {
		it("should mask passwords and generate hints", () => {
			const list = {
				items: [
					{ username: "admin", password: "secret123" },
					{ username: "user2", password: "pw" },
				],
			};
			const result = maskItems(list);
			expect(result.items[0].password).toBe("");
			expect(result.items[0].hint).toBe("s********");
			expect(result.items[1].password).toBe("");
			expect(result.items[1].hint).toBe("p*");
		});

		it("should handle items without passwords", () => {
			const list = {
				items: [{ username: "admin" }],
			};
			const result = maskItems(list);
			expect(result.items[0].hint).toBe("*********");
			expect(result.items[0].password).toBe("");
		});

		it("should handle empty items array", () => {
			const list = { items: [] };
			const result = maskItems(list);
			expect(result.items).toEqual([]);
		});

		it("should return list as-is when items is undefined", () => {
			const list = { name: "test" };
			const result = maskItems(list);
			expect(result).toEqual({ name: "test" });
		});

		it("should handle null list gracefully (items undefined)", () => {
			const result = maskItems({});
			expect(result).toEqual({});
		});
	});

	// ── build ───────────────────────────────────────────────────────────

	describe("build", () => {
		it("should write htpasswd file for items with passwords", async () => {
			const fs = await import("node:fs");
			const list = {
				id: 5,
				name: "TestList",
				items: [{ username: "admin", password: "testpass" }],
				mtls_enabled: false,
			};
			await build(list);
			expect(fs.default.promises.writeFile).toHaveBeenCalledWith("/data/access/5", "", { encoding: "utf8" });
			expect(fs.default.promises.appendFile).toHaveBeenCalled();
		});

		it("should create empty file when no items", async () => {
			const fs = await import("node:fs");
			const list = { id: 3, name: "Empty", items: [], mtls_enabled: false };
			await build(list);
			expect(fs.default.promises.writeFile).toHaveBeenCalledWith("/data/access/3", "", { encoding: "utf8" });
			expect(fs.default.promises.appendFile).not.toHaveBeenCalled();
		});

		it("should write mTLS certificate when enabled with custom cert", async () => {
			const fs = await import("node:fs");
			const list = {
				id: 9,
				name: "mTLS",
				items: [],
				mtls_enabled: true,
				mtls_use_internal: false,
				mtls_certificate: "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----",
			};
			await build(list);
			expect(fs.default.promises.writeFile).toHaveBeenCalledWith(
				"/data/access/9.crt",
				expect.stringContaining("BEGIN CERTIFICATE"),
				{ encoding: "utf8" },
			);
		});

		it("should not skip already-hashed passwords (starting with $2)", async () => {
			const fs = await import("node:fs");
			const list = {
				id: 11,
				name: "HashedList",
				items: [{ username: "user1", password: "$2a$13$alreadyhashed" }],
				mtls_enabled: false,
			};
			await build(list);
			expect(fs.default.promises.appendFile).toHaveBeenCalled();
		});
	});
});
