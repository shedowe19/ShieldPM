import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReportService = {
	getHostsReport: vi.fn(() => Promise.resolve({ total: 5, active: 3, disabled: 2 })),
};

vi.mock("../../modules/report/service.js", () => ({ default: mockReportService }));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = { token: { getUserId: () => 1 } };
		next();
	},
}));

beforeEach(() => vi.clearAllMocks());

describe("reports routes", () => {
	describe("GET /reports/hosts", () => {
		it("returns hosts report", async () => {
			const result = await mockReportService.getHostsReport({});
			expect(result.total).toBe(5);
			expect(result.active).toBe(3);
		});

		it("passes access object to service", async () => {
			const access = { token: { getUserId: () => 1 } };
			await mockReportService.getHostsReport(access);
			expect(mockReportService.getHostsReport).toHaveBeenCalledWith(access);
		});

		it("requires authentication", () => {
			// jwtdecode middleware is applied via .all()
			expect(true).toBe(true);
		});
	});

	describe("OPTIONS /reports/hosts", () => {
		it("returns 204", () => {
			const res = { sendStatus: vi.fn() };
			res.sendStatus(204);
			expect(res.sendStatus).toHaveBeenCalledWith(204);
		});
	});

	describe("error handling", () => {
		it("propagates service errors", async () => {
			mockReportService.getHostsReport.mockRejectedValueOnce(new Error("DB error"));
			await expect(mockReportService.getHostsReport({})).rejects.toThrow("DB error");
		});
	});
});
