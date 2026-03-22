import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../logger.js", () => ({
	access: { error: vi.fn(), info: vi.fn() },
}));

vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: vi.fn().mockReturnValue({
			select: vi.fn().mockReturnThis(),
			andWhere: vi.fn().mockReturnThis(),
			// biome-ignore lint/suspicious/noThenProperty: Objection QueryBuilder is thenable
			then: vi.fn((cb) => cb([])),
		}),
	},
}));

const mockTokenLoad = vi.fn();
const mockTokenGet = vi.fn();
const mockTokenHasScope = vi.fn();
const mockTokenGetUserId = vi.fn();

vi.mock("../../models/token.js", () => ({
	default: () => ({
		load: mockTokenLoad,
		get: mockTokenGet,
		hasScope: mockTokenHasScope,
		getUserId: mockTokenGetUserId,
	}),
}));

vi.mock("../../models/user.js", () => ({
	default: {
		query: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnThis(),
			andWhere: vi.fn().mockReturnThis(),
			allowGraph: vi.fn().mockReturnThis(),
			withGraphFetched: vi.fn().mockReturnThis(),
			first: vi.fn().mockResolvedValue(null),
		}),
	},
}));

vi.mock("../../lib/error.js", () => {
	class PermissionError extends Error {
		constructor(msg) {
			super(msg);
			this.name = "PermissionError";
			this.status = 403;
		}
	}
	class AuthError extends Error {
		constructor(msg) {
			super(msg);
			this.name = "AuthError";
			this.status = 400;
		}
	}
	return {
		default: { PermissionError, AuthError },
	};
});

const Access = (await import("../../lib/access.js")).default;

describe("access", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("is a constructor function", () => {
		expect(typeof Access).toBe("function");
	});

	it("returns object with token, load, can, reloadObjects", () => {
		const access = new Access("some-token");
		expect(access).toHaveProperty("token");
		expect(access).toHaveProperty("load");
		expect(access).toHaveProperty("can");
		expect(access).toHaveProperty("reloadObjects");
	});

	describe("load", () => {
		it("calls token.load when tokenString is provided", async () => {
			mockTokenLoad.mockResolvedValue({ attrs: { id: 1 }, scope: ["user"] });
			const access = new Access("valid-token");
			await access.load();
			expect(mockTokenLoad).toHaveBeenCalledWith("valid-token");
		});

		it("returns allowInternal value when no token", async () => {
			const access = new Access(null);
			const result = await access.load(true);
			expect(result).toBe(true);
		});

		it("returns null when no token and allowInternal is falsy", async () => {
			const access = new Access(null);
			const result = await access.load(false);
			expect(result).toBe(null);
		});
	});

	describe("can", () => {
		it("returns true when allowInternalAccess is set", async () => {
			const access = new Access(null);
			await access.load(true);
			const result = await access.can("users:list");
			expect(result).toBe(true);
		});

		it("throws PermissionError when no token and not internal", async () => {
			const access = new Access(null);
			await access.load(false);
			await expect(access.can("users:list")).rejects.toThrow("Permission Denied");
		});
	});
});
