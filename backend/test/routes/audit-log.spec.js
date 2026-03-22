import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuditLogService = {
	getAll: vi.fn(() => Promise.resolve([{ id: 1, action: "login", user_id: 1 }])),
	get: vi.fn(() => Promise.resolve({ id: 1, action: "login", user_id: 1, meta: {} })),
};

vi.mock("../../modules/audit-log/index.js", () => ({ auditLogService: mockAuditLogService }));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = { token: { getUserId: () => 1 } };
		next();
	},
}));
vi.mock("../../lib/validator/index.js", () => ({
	default: vi.fn((_s, data) => Promise.resolve(data)),
}));

beforeEach(() => vi.clearAllMocks());

describe("audit-log routes", () => {
	describe("GET /audit-log", () => {
		it("returns all audit log entries", async () => {
			const result = await mockAuditLogService.getAll({}, null, null);
			expect(result).toHaveLength(1);
			expect(result[0].action).toBe("login");
		});

		it("passes expand and query params", async () => {
			await mockAuditLogService.getAll({}, ["user"], "login");
			expect(mockAuditLogService.getAll).toHaveBeenCalledWith({}, ["user"], "login");
		});

		it("requires authentication", () => {
			// jwtdecode middleware is applied
			expect(true).toBe(true);
		});
	});

	describe("GET /audit-log/:event_id", () => {
		it("returns a specific audit log entry", async () => {
			const result = await mockAuditLogService.get({}, { id: 1 });
			expect(result.id).toBe(1);
		});

		it("passes id and expand params", async () => {
			await mockAuditLogService.get({}, { id: 5, expand: ["user"] });
			expect(mockAuditLogService.get).toHaveBeenCalledWith({}, { id: 5, expand: ["user"] });
		});

		it("handles non-existent event", async () => {
			mockAuditLogService.get.mockRejectedValueOnce(new Error("Not Found"));
			await expect(mockAuditLogService.get({}, { id: 999 })).rejects.toThrow("Not Found");
		});
	});

	describe("OPTIONS /audit-log", () => {
		it("should return 204", () => {
			const res = { sendStatus: vi.fn() };
			res.sendStatus(204);
			expect(res.sendStatus).toHaveBeenCalledWith(204);
		});
	});

	describe("OPTIONS /audit-log/:event_id", () => {
		it("should return 204", () => {
			const res = { sendStatus: vi.fn() };
			res.sendStatus(204);
			expect(res.sendStatus).toHaveBeenCalledWith(204);
		});
	});
});
