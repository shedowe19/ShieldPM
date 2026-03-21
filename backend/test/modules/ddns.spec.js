import { beforeEach, describe, expect, it, vi } from "vitest";
import ddnsService from "../../modules/ddns/service.js";
import DdnsProvider from "../../models/ddns_provider.js";
import { getLastKnownIps, setLastKnownIps, INTERVAL, getTimer, setTimer } from "../../modules/ddns/helpers.js";

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

		it("should handle both failures gracefully", async () => {
			fetchMock.mockRejectedValueOnce(new Error("Network Error"));
			fetchMock.mockRejectedValueOnce(new Error("Network Error"));
			const ips = await ddnsService.getWanIps();
			expect(ips).toEqual({ ipv4: null, ipv6: null });
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

			// 1. Mock List Record (A)
			fetchMock.mockResolvedValueOnce({
				json: async () => ({ success: true, result: [{ id: "rec1", proxied: false }] }),
			});

			// 2. Mock List Record (AAAA) - Not found -> Create
			// (Due to Promise.all concurrency, the two List calls execute before the update/create calls)
			fetchMock.mockResolvedValueOnce({
				json: async () => ({ success: true, result: [] }),
			});

			// 3. Mock Update Record (A)
			fetchMock.mockResolvedValueOnce({
				json: async () => ({ success: true }),
			});

			// 4. Mock Create Record (AAAA)
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

	describe("helpers – getLastKnownIps / setLastKnownIps", () => {
		it("should return default null IPs", () => {
			setLastKnownIps({ ipv4: null, ipv6: null });
			const ips = getLastKnownIps();
			expect(ips.ipv4).toBeNull();
			expect(ips.ipv6).toBeNull();
		});

		it("should store and return IPs", () => {
			setLastKnownIps({ ipv4: "1.2.3.4", ipv6: "::1" });
			const ips = getLastKnownIps();
			expect(ips.ipv4).toBe("1.2.3.4");
			expect(ips.ipv6).toBe("::1");
		});

		it("should create a copy, not a reference", () => {
			const original = { ipv4: "5.6.7.8", ipv6: null };
			setLastKnownIps(original);
			original.ipv4 = "changed";
			expect(getLastKnownIps().ipv4).toBe("5.6.7.8");
		});
	});

	describe("helpers – INTERVAL", () => {
		it("should be 60000ms (1 minute)", () => {
			expect(INTERVAL).toBe(60000);
		});
	});

	describe("helpers – timer management", () => {
		it("should allow setting and getting timer", () => {
			setTimer("fake-timer");
			expect(getTimer()).toBe("fake-timer");
			setTimer(null);
		});
	});

	describe("initTimer", () => {
		it("should set a timer", () => {
			vi.useFakeTimers();
			ddnsService.initTimer();
			expect(getTimer()).not.toBeNull();
			clearInterval(getTimer());
			setTimer(null);
			vi.useRealTimers();
		});
	});

	describe("process", () => {
		it("should skip when no providers are enabled", async () => {
			DdnsProvider.query.mockReturnValue({
				where: vi.fn().mockResolvedValue([]),
			});
			await ddnsService.process();
			// No fetch calls for IPs since no providers
		});

		it("should process forced update", async () => {
			DdnsProvider.query.mockReturnValue({
				where: vi.fn().mockResolvedValue([
					{ id: 1, name: "Test", provider: "cloudflare", domains: ["test.com"], config: { token: "t", zone_id: "z" }, last_ipv4: null, last_ipv6: null, ip_ver: "v4" },
				]),
			});
			fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ip: "9.9.9.9" }) });
			fetchMock.mockRejectedValueOnce(new Error("no v6"));
			// updateProvider will be called, mock the Cloudflare calls
			fetchMock.mockResolvedValueOnce({ json: async () => ({ success: true, result: [] }) });
			fetchMock.mockResolvedValueOnce({ json: async () => ({ success: true }) });
			const patchAndFetchById = vi.fn().mockResolvedValue({});
			DdnsProvider.query.mockReturnValueOnce({ where: vi.fn().mockResolvedValue([{ id: 1, name: "Test", provider: "cloudflare", domains: ["test.com"], config: { token: "t", zone_id: "z" }, last_ipv4: null, last_ipv6: null, ip_ver: "v4" }]) });
			DdnsProvider.query.mockReturnValue({ patchAndFetchById });
			await ddnsService.process(true);
		});
	});
});
