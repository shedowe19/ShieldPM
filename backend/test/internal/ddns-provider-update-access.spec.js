import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), getWanIps: vi.fn(), updateProvider: vi.fn() }));
vi.mock("../../models/ddns_provider.js", () => ({ default: { query: mocks.query } }));
vi.mock("../../internal/audit-log.js", () => ({ default: {} }));
vi.mock("../../internal/gitops.js", () => ({ default: {} }));
vi.mock("../../internal/ddns.js", () => ({
	default: { getWanIps: mocks.getWanIps, updateProvider: mocks.updateProvider },
}));

import service from "../../internal/ddns-provider.js";

describe("DDNS mutation authorization and test result", () => {
	beforeEach(() => vi.clearAllMocks());
	it.each(["update", "test"])("requires update capability for internal %s calls", async (method) => {
		const access = { can: vi.fn().mockRejectedValue(new Error("Permission Denied")) };
		await expect(service[method](access, { id: 7 })).rejects.toThrow("Permission Denied");
		expect(access.can).toHaveBeenCalledWith("ddns_providers:update", 7);
		expect(mocks.query).not.toHaveBeenCalled();
		expect(mocks.updateProvider).not.toHaveBeenCalled();
	});
	it("does not report success when the DNS provider rejected an update", async () => {
		const access = { can: vi.fn().mockResolvedValue({ permission_visibility: "all" }) };
		mocks.query.mockReturnValue({ where: vi.fn().mockReturnThis(), first: async () => ({ id: 7 }) });
		mocks.getWanIps.mockResolvedValue({ ipv4: "1.1.1.1", ipv6: null });
		mocks.updateProvider.mockResolvedValue({ success: false, error: "DNS API rejected the token" });
		await expect(service.test(access, { id: 7 })).rejects.toThrow("DNS API rejected the token");
	});
});
