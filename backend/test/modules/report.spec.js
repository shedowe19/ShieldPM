import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../modules/proxy-host/service.js", () => ({
	default: { getCount: vi.fn().mockResolvedValue(10) },
}));

vi.mock("../../modules/redirection-host/service.js", () => ({
	default: { getCount: vi.fn().mockResolvedValue(5) },
}));

vi.mock("../../modules/stream/service.js", () => ({
	default: { getCount: vi.fn().mockResolvedValue(3) },
}));

vi.mock("../../modules/dead-host/service.js", () => ({
	default: { getCount: vi.fn().mockResolvedValue(2) },
}));

import reportService from "../../modules/report/service.js";
import internalProxyHost from "../../modules/proxy-host/service.js";
import internalRedirectionHost from "../../modules/redirection-host/service.js";
import internalStream from "../../modules/stream/service.js";
import internalDeadHost from "../../modules/dead-host/service.js";

describe("report module", () => {
	const mockAccess = {
		can: vi.fn().mockResolvedValue({ visibility: "all" }),
		token: { getUserId: vi.fn(() => 1) },
	};

	beforeEach(() => vi.clearAllMocks());

	describe("getHostsReport", () => {
		it("should check reports:hosts permission", async () => {
			await reportService.getHostsReport(mockAccess);
			expect(mockAccess.can).toHaveBeenCalledWith("reports:hosts", 1);
		});

		it("should return all host counts", async () => {
			const result = await reportService.getHostsReport(mockAccess);
			expect(result).toEqual({
				proxy: 10,
				redirection: 5,
				stream: 3,
				dead: 2,
			});
		});

		it("should call getCount for all host types", async () => {
			await reportService.getHostsReport(mockAccess);
			expect(internalProxyHost.getCount).toHaveBeenCalledWith(1, "all");
			expect(internalRedirectionHost.getCount).toHaveBeenCalledWith(1, "all");
			expect(internalStream.getCount).toHaveBeenCalledWith(1, "all");
			expect(internalDeadHost.getCount).toHaveBeenCalledWith(1, "all");
		});

		it("should pass user visibility for non-admin", async () => {
			const limitedAccess = {
				can: vi.fn().mockResolvedValue({ visibility: "user" }),
				token: { getUserId: vi.fn(() => 5) },
			};
			await reportService.getHostsReport(limitedAccess);
			expect(internalProxyHost.getCount).toHaveBeenCalledWith(5, "user");
		});

		it("should throw if permission denied", async () => {
			const deniedAccess = {
				can: vi.fn().mockRejectedValue(new Error("Permission Denied")),
				token: { getUserId: vi.fn(() => 1) },
			};
			await expect(reportService.getHostsReport(deniedAccess)).rejects.toThrow("Permission Denied");
		});
	});
});
