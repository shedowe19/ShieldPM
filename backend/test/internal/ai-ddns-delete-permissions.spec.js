import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	deleteDdnsProvider: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({
	getEncryptionKey: vi.fn().mockReturnValue("0".repeat(64)),
	isDemoMode: vi.fn().mockReturnValue(false),
}));
vi.mock("../../models/cloudflared_tunnel.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../models/tor_onion.js", () => ({ default: {} }));
vi.mock("../../internal/access-list.js", () => ({ default: {} }));
vi.mock("../../internal/audit-log.js", () => ({ default: {} }));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/cloudflared.js", () => ({ default: {} }));
vi.mock("../../internal/ddns-provider.js", () => ({ default: { delete: mocks.deleteDdnsProvider } }));
vi.mock("../../internal/dead-host.js", () => ({ default: {} }));
vi.mock("../../internal/ip_ranges.js", () => ({ default: {} }));
vi.mock("../../internal/maintenance.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../internal/pki.js", () => ({ default: {} }));
vi.mock("../../internal/proxy-host.js", () => ({ default: {} }));
vi.mock("../../internal/redirection-host.js", () => ({ default: {} }));
vi.mock("../../internal/report.js", () => ({ default: {} }));
vi.mock("../../internal/setting.js", () => ({ default: {} }));
vi.mock("../../internal/stream.js", () => ({ default: {} }));
vi.mock("../../internal/token.js", () => ({ default: {} }));
vi.mock("../../internal/tor.js", () => ({ default: {} }));
vi.mock("../../internal/user.js", () => ({ default: {} }));

import { executeTools } from "../../internal/ai/executor.js";

const makeAccess = (can) => ({
	can,
	token: { getUserId: vi.fn().mockReturnValue(7) },
});

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

describe("AI DDNS deletion authorization", () => {
	afterAll(() => {
		consoleErrorSpy.mockRestore();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.deleteDdnsProvider.mockImplementation(async (access, data) => {
			await access.can("ddns_providers:delete", { id: data.id });
			return true;
		});
	});

	it("delegates DDNS deletion to the authorized provider service", async () => {
		const access = makeAccess(vi.fn().mockResolvedValue(true));

		const results = await executeTools(access, [{ name: "delete_ddns_provider", args: { id: 42 } }]);

		expect(results.map((result) => result.result)).toEqual(["Deleted DDNS Provider ID: 42"]);
		expect(mocks.deleteDdnsProvider).toHaveBeenCalledWith(access, { id: 42 });
	});

	it("does not delete a DDNS provider when the service rejects the capability", async () => {
		const access = makeAccess(vi.fn().mockRejectedValue(new Error("Permission Denied")));

		const results = await executeTools(access, [{ name: "delete_ddns_provider", args: { id: 42 } }]);

		expect(results.map((result) => result.result)).toEqual(["Error: Permission Denied"]);
	});
});
