import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
	default: {
		existsSync: vi.fn(() => true),
		mkdirSync: vi.fn(),
		rmSync: vi.fn(),
	},
	existsSync: vi.fn(() => true),
	mkdirSync: vi.fn(),
}));

vi.mock("node:path", () => ({
	default: {
		join: vi.fn((...args) => args.join("/")),
	},
	join: vi.fn((...args) => args.join("/")),
}));

vi.mock("../../lib/encryption.js", () => ({
	decrypt: vi.fn((v) => `decrypted-${v}`),
	encrypt: vi.fn((v) => `encrypted-${v}`),
}));

vi.mock("../../lib/config.js", () => ({
	isDemoMode: vi.fn(() => false),
}));

vi.mock("../../lib/error.js", () => {
	class AuthError extends Error {
		constructor(m) {
			super(m);
			this.name = "AuthError";
		}
	}
	class ItemNotFoundError extends Error {
		constructor(id) {
			super(`Not Found - ${id}`);
			this.name = "ItemNotFoundError";
		}
	}
	class ValidationError extends Error {
		constructor(m) {
			super(m);
			this.name = "ValidationError";
		}
	}
	return { default: { AuthError, ItemNotFoundError, ValidationError } };
});

vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: vi.fn(() => mockProxyHostQuery),
	},
}));

vi.mock("isomorphic-git", () => ({
	default: {
		clone: vi.fn().mockResolvedValue(),
		pull: vi.fn().mockResolvedValue(),
		log: vi.fn().mockResolvedValue([{ oid: "abc123" }]),
		currentBranch: vi.fn().mockResolvedValue("main"),
	},
}));

vi.mock("isomorphic-git/http/node", () => ({
	default: {},
}));

vi.mock("../../modules/nginx/index.js", () => ({
	nginxService: {
		configure: vi.fn().mockResolvedValue(),
		reload: vi.fn().mockResolvedValue(),
	},
}));

const mockProxyHostQuery = {
	where: vi.fn().mockReturnThis(),
	whereNotNull: vi.fn().mockReturnThis(),
	findById: vi.fn().mockReturnThis(),
	patch: vi.fn().mockResolvedValue(1),
	withGraphFetched: vi.fn().mockResolvedValue({ id: 1 }),
};

import { intervalToMs, getWebsiteDir, WEBSITES_DIR, getAuth, pollingTimers } from "../../modules/git-deploy/helpers.js";

describe("git-deploy module", () => {
	beforeEach(() => vi.clearAllMocks());

	describe("helpers – intervalToMs", () => {
		it("should convert seconds", () => {
			expect(intervalToMs(30, "s")).toBe(30000);
		});

		it("should convert minutes", () => {
			expect(intervalToMs(5, "m")).toBe(300000);
		});

		it("should convert hours", () => {
			expect(intervalToMs(2, "h")).toBe(7200000);
		});

		it("should default to minutes for unknown unit", () => {
			expect(intervalToMs(3, "x")).toBe(180000);
		});
	});

	describe("helpers – WEBSITES_DIR", () => {
		it("should have correct default path", () => {
			expect(WEBSITES_DIR).toBe("/data/websites");
		});
	});

	describe("helpers – getWebsiteDir", () => {
		it("should create directory path based on hostId", () => {
			const dir = getWebsiteDir(42);
			expect(dir).toContain("host-42");
		});

		it("should return different dirs for different hosts", () => {
			const dir1 = getWebsiteDir(1);
			const dir2 = getWebsiteDir(2);
			expect(dir1).not.toBe(dir2);
		});
	});

	describe("helpers – getAuth", () => {
		it("should return empty object when no credentials", () => {
			expect(getAuth(null)).toEqual({});
			expect(getAuth(undefined)).toEqual({});
		});

		it("should return onAuth function when credentials exist", () => {
			const auth = getAuth("encrypted-token");
			expect(auth).toHaveProperty("onAuth");
			expect(typeof auth.onAuth).toBe("function");
		});

		it("should decrypt credentials in onAuth", () => {
			const auth = getAuth("my-token");
			const result = auth.onAuth();
			expect(result.username).toBe("git");
			expect(result.password).toBe("decrypted-my-token");
		});
	});

	describe("helpers – pollingTimers", () => {
		it("should be a Map", () => {
			expect(pollingTimers).toBeInstanceOf(Map);
		});

		it("should allow setting and clearing timers", () => {
			pollingTimers.set(99, "fake-timer");
			expect(pollingTimers.has(99)).toBe(true);
			pollingTimers.delete(99);
			expect(pollingTimers.has(99)).toBe(false);
		});
	});
});
