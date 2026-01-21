import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ddnsService from "../../internal/ddns.js";
import DdnsProvider from "../../models/ddns_provider.js";

// Mock DB
vi.mock("../../models/ddns_provider.js", () => {
	return {
		default: {
			query: vi.fn(),
		},
	};
});

// Mock Logger
vi.mock("../../logger.js", () => ({
	global: {
		info: vi.fn(),
		error: vi.fn(),
		success: vi.fn(),
		debug: vi.fn(),
	},
}));

// Mock Global Fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe("DDNS Service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("getWanIps", () => {
		it("should return IPs on success", async () => {
			// Mock IPv4
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ ip: "1.2.3.4" }),
			});
			// Mock IPv6
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ ip: "2001:db8::1" }),
			});

			const ips = await ddnsService.getWanIps();
			expect(ips).toEqual({ ipv4: "1.2.3.4", ipv6: "2001:db8::1" });
			expect(fetchMock).toHaveBeenCalledWith("https://api.ipify.org?format=json");
			expect(fetchMock).toHaveBeenCalledWith("https://api6.ipify.org?format=json");
		});

		it("should handle partial failures gracefully", async () => {
			// Mock IPv4 Failure
			fetchMock.mockRejectedValueOnce(new Error("Network Error"));
			// Mock IPv6 Success
			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ ip: "2001:db8::1" }),
			});

			const ips = await ddnsService.getWanIps();
			expect(ips).toEqual({ ipv4: null, ipv6: "2001:db8::1" });
		});
	});

	describe("updateProvider", () => {
		it("should update Cloudflare", async () => {
			const provider = {
				id: 1,
				name: "Test CF",
				provider: "cloudflare",
				domains: ["example.com"],
				config: { token: "abc", zone_id: "xyz" },
				last_ipv4: "1.1.1.1",
				last_ipv6: null,
				ip_ver: "dual",
			};

			// Mock List Record (A)
			fetchMock.mockResolvedValueOnce({
				json: async () => ({ success: true, result: [{ id: "rec1", proxied: false }] }),
			});

			// Mock Update Record (A)
			fetchMock.mockResolvedValueOnce({
				json: async () => ({ success: true }),
			});

			// Mock List Record (AAAA) - Not found -> Create
			fetchMock.mockResolvedValueOnce({
				json: async () => ({ success: true, result: [] }),
			});

			// Mock Create Record (AAAA)
			fetchMock.mockResolvedValueOnce({
				json: async () => ({ success: true }),
			});

			// Mock DB Patch
			const patchAndFetchById = vi.fn().mockResolvedValue({});
			DdnsProvider.query.mockReturnValue({
				patchAndFetchById,
			});

			await ddnsService.updateProvider(provider, { ipv4: "2.2.2.2", ipv6: "2001:db8::2" });

			expect(fetchMock).toHaveBeenCalledTimes(4); // List A, Update A, List AAAA, Create AAAA
			expect(patchAndFetchById).toHaveBeenCalledWith(
				1,
				expect.objectContaining({
					last_ipv4: "2.2.2.2",
					last_ipv6: "2001:db8::2",
					last_error: null,
				}),
			);
		});
	});
});
