import { beforeEach, describe, expect, it, vi } from "vitest";

const _mock = {
	queryResult: null,
	insertResult: null,
};

const mockQueryBuilder = () => ({
	where: vi.fn().mockReturnThis(),
	first: vi.fn(() => Promise.resolve(_mock.queryResult)),
	insertAndFetch: vi.fn((data) => Promise.resolve(_mock.insertResult || { id: 1, ...data })),
	patch: vi.fn().mockResolvedValue(1),
	delete: vi.fn().mockResolvedValue(1),
	orderBy: vi.fn(() => Promise.resolve([])),
});

vi.mock("../../models/dashboard_note.js", () => ({
	default: {
		query: vi.fn(() => mockQueryBuilder()),
	},
}));

vi.mock("../../lib/error.js", () => {
	class ItemNotFoundError extends Error {
		constructor(id) { super(`Not Found - ${id}`); this.name = "ItemNotFoundError"; this.status = 404; }
	}
	return { default: { ItemNotFoundError } };
});

vi.mock("../../modules/audit-log/service.js", () => ({
	default: { add: vi.fn().mockResolvedValue() },
}));

import dashboardNoteService from "../../modules/dashboard-note/service.js";

describe("dashboard-note module", () => {
	const mockAccess = {
		can: vi.fn().mockResolvedValue(true),
		token: { getUserId: vi.fn(() => 1) },
	};

	beforeEach(() => {
		vi.clearAllMocks();
		_mock.queryResult = null;
		_mock.insertResult = null;
	});

	describe("create", () => {
		it("should check permissions and insert a note", async () => {
			_mock.insertResult = { id: 1, title: "Test", content: "Hello" };
			_mock.queryResult = { id: 1, title: "Test", content: "Hello" };
			const result = await dashboardNoteService.create(mockAccess, { title: "Test", content: "Hello" });
			expect(mockAccess.can).toHaveBeenCalledWith("dashboard_notes:create");
			expect(result).toMatchObject({ id: 1, title: "Test" });
		});
	});

	describe("get", () => {
		it("should return note when found", async () => {
			_mock.queryResult = { id: 1, title: "My Note" };
			const result = await dashboardNoteService.get(mockAccess, { id: 1 });
			expect(result).toMatchObject({ id: 1, title: "My Note" });
			expect(mockAccess.can).toHaveBeenCalledWith("dashboard_notes:get", 1);
		});

		it("should throw ItemNotFoundError when not found", async () => {
			_mock.queryResult = null;
			await expect(dashboardNoteService.get(mockAccess, { id: 999 })).rejects.toMatchObject({
				name: "ItemNotFoundError",
			});
		});
	});

	describe("getAll", () => {
		it("should check list permission", async () => {
			await dashboardNoteService.getAll(mockAccess);
			expect(mockAccess.can).toHaveBeenCalledWith("dashboard_notes:list");
		});
	});

	describe("delete", () => {
		it("should check permissions before deleting", async () => {
			_mock.queryResult = { id: 1, title: "To Delete" };
			const result = await dashboardNoteService.delete(mockAccess, { id: 1 });
			expect(mockAccess.can).toHaveBeenCalledWith("dashboard_notes:delete", 1);
			expect(result).toBe(true);
		});

		it("should throw if note not found", async () => {
			_mock.queryResult = null;
			await expect(dashboardNoteService.delete(mockAccess, { id: 999 })).rejects.toMatchObject({
				name: "ItemNotFoundError",
			});
		});
	});

	describe("update", () => {
		it("should check permissions and patch", async () => {
			_mock.queryResult = { id: 1, title: "Updated" };
			const result = await dashboardNoteService.update(mockAccess, { id: 1, title: "Updated" });
			expect(mockAccess.can).toHaveBeenCalledWith("dashboard_notes:update", 1);
			expect(result).toMatchObject({ id: 1, title: "Updated" });
		});
	});
});
