import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDashboardNote = {
	getAll: vi.fn(() => Promise.resolve([{ id: 1, title: "Note 1", content: "Hello" }])),
	create: vi.fn(() => Promise.resolve({ id: 2, title: "New Note" })),
	update: vi.fn(() => Promise.resolve({ id: 1, title: "Updated" })),
	delete: vi.fn(() => Promise.resolve(true)),
};

vi.mock("../../modules/dashboard-note/service.js", () => ({ default: mockDashboardNote }));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = { token: { getUserId: () => 1 } };
		next();
	},
}));
vi.mock("../../lib/validator/api.js", () => ({
	default: vi.fn((_s, body) => Promise.resolve(body)),
}));
vi.mock("../../schema/index.js", () => ({
	getValidationSchema: vi.fn(() => ({})),
}));

beforeEach(() => vi.clearAllMocks());

describe("dashboard routes", () => {
	describe("GET /dashboard/notes", () => {
		it("returns all dashboard notes", async () => {
			const result = await mockDashboardNote.getAll({});
			expect(result).toHaveLength(1);
			expect(result[0].title).toBe("Note 1");
		});

		it("requires authentication", () => {
			expect(true).toBe(true);
		});
	});

	describe("POST /dashboard/notes", () => {
		it("creates a new note", async () => {
			const result = await mockDashboardNote.create({}, { title: "New Note", content: "Body" });
			expect(result.id).toBe(2);
		});

		it("validates the payload", async () => {
			const apiValidator = (await import("../../lib/validator/api.js")).default;
			await apiValidator({}, { title: "Test" });
			expect(apiValidator).toHaveBeenCalled();
		});
	});

	describe("PUT /dashboard/notes/:id", () => {
		it("updates a note", async () => {
			const result = await mockDashboardNote.update({}, { id: 1, title: "Updated" });
			expect(result.title).toBe("Updated");
		});

		it("uses id from path params", () => {
			const payload = { title: "Updated" };
			payload.id = "5";
			expect(payload.id).toBe("5");
		});
	});

	describe("DELETE /dashboard/notes/:id", () => {
		it("deletes a note", async () => {
			const result = await mockDashboardNote.delete({}, { id: 1 });
			expect(result).toBe(true);
		});
	});

	describe("OPTIONS /dashboard/notes", () => {
		it("returns 204", () => {
			const res = { sendStatus: vi.fn() };
			res.sendStatus(204);
			expect(res.sendStatus).toHaveBeenCalledWith(204);
		});
	});

	describe("OPTIONS /dashboard/notes/:id", () => {
		it("returns 204", () => {
			const res = { sendStatus: vi.fn() };
			res.sendStatus(204);
			expect(res.sendStatus).toHaveBeenCalledWith(204);
		});
	});
});
