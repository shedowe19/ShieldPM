import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock models and deps
const mockSettingQuery = {
	where: vi.fn().mockReturnThis(),
	first: vi.fn(),
	count: vi.fn().mockReturnThis(),
	patch: vi.fn().mockResolvedValue(1),
	orderBy: vi.fn().mockReturnThis(),
};

vi.mock("../../models/setting.js", () => ({
	default: {
		query: vi.fn(() => ({ ...mockSettingQuery })),
	},
}));

vi.mock("../../lib/error.js", () => {
	class ItemNotFoundError extends Error {
		constructor(id) { super(`Not Found - ${id}`); this.name = "ItemNotFoundError"; this.status = 404; }
	}
	class InternalValidationError extends Error {
		constructor(m) { super(m); this.name = "InternalValidationError"; this.status = 400; }
	}
	class ValidationError extends Error {
		constructor(m) { super(m); this.name = "ValidationError"; this.status = 400; }
	}
	return {
		default: { ItemNotFoundError, InternalValidationError, ValidationError },
	};
});

vi.mock("../../modules/audit-log/index.js", () => ({
	auditLogService: { add: vi.fn().mockResolvedValue() },
}));

vi.mock("../../modules/nginx/index.js", () => ({
	nginxService: {
		deleteConfig: vi.fn().mockResolvedValue(),
		generateConfig: vi.fn().mockResolvedValue(),
		test: vi.fn().mockResolvedValue(),
		reload: vi.fn().mockResolvedValue(),
	},
}));

vi.mock("node:fs", () => ({
	default: { writeFileSync: vi.fn() },
	writeFileSync: vi.fn(),
}));

import { get, getAll, getCount } from "../../modules/setting/reads.js";
import settingModel from "../../models/setting.js";

describe("setting module – reads", () => {
	const mockAccess = {
		can: vi.fn().mockResolvedValue(true),
	};

	beforeEach(() => {
		vi.clearAllMocks();
		settingModel.query.mockReturnValue({ ...mockSettingQuery });
	});

	describe("get", () => {
		it("should return setting when found", async () => {
			const fakeSetting = { id: "default-site", value: "congratulations", meta: {} };
			mockSettingQuery.first.mockResolvedValueOnce(fakeSetting);
			const result = await get(mockAccess, { id: "default-site" });
			expect(result).toEqual(fakeSetting);
			expect(mockAccess.can).toHaveBeenCalledWith("settings:get", "default-site");
		});

		it("should throw ItemNotFoundError when not found", async () => {
			mockSettingQuery.first.mockResolvedValueOnce(null);
			await expect(get(mockAccess, { id: "nonexistent" })).rejects.toMatchObject({
				name: "ItemNotFoundError",
			});
		});
	});

	describe("getCount", () => {
		it("should return integer count", async () => {
			mockSettingQuery.first.mockResolvedValueOnce({ count: "5" });
			const result = await getCount(mockAccess);
			expect(result).toBe(5);
			expect(typeof result).toBe("number");
		});
	});

	describe("getAll", () => {
		it("should return settings ordered by description", async () => {
			const fakeSettings = [
				{ id: "a", description: "Alpha" },
				{ id: "b", description: "Beta" },
			];
			mockSettingQuery.orderBy.mockResolvedValueOnce(fakeSettings);
			// getAll returns query builder with orderBy, which resolves to array
			settingModel.query.mockReturnValue({
				orderBy: vi.fn().mockResolvedValue(fakeSettings),
			});
			const result = await getAll(mockAccess);
			expect(result).toEqual(fakeSettings);
			expect(mockAccess.can).toHaveBeenCalledWith("settings:list");
		});
	});
});
