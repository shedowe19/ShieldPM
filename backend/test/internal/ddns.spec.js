import { beforeEach, describe, expect, it, vi } from "vitest";
import ddnsService from "../../internal/ddns.js";
import errs from "../../lib/error.js";
import { global as logger } from "../../logger.js";
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
		fetchMock.mockReset();
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
			expect(fetchMock).toHaveBeenCalledWith(
				"https://api.ipify.org?format=json",
				expect.objectContaining({ signal: expect.any(AbortSignal) }),
			);
			expect(fetchMock).toHaveBeenCalledWith(
				"https://api6.ipify.org?format=json",
				expect.objectContaining({ signal: expect.any(AbortSignal) }),
			);
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
		it("keeps query metacharacters inside provider values", async () => {
			DdnsProvider.query.mockReturnValue({ patchAndFetchById: vi.fn() });
			fetchMock.mockResolvedValue({ ok: true, text: async () => "OK" });
			await ddnsService.updateProvider(
				{
					id: 1,
					provider: "duckdns",
					domains: ["example&clear=true"],
					config: { token: "token&unexpected=true" },
				},
				{ ipv4: "1.2.3.4", ipv6: null },
			);
			const url = new URL(fetchMock.mock.calls[0][0]);
			expect(url.searchParams.get("domains")).toBe("example&clear=true");
			expect(url.searchParams.get("token")).toBe("token&unexpected=true");
			expect(url.searchParams.has("clear")).toBe(false);
		});
		it("does not let domain query characters change Cloudflare record filters", async () => {
			DdnsProvider.query.mockReturnValue({ patchAndFetchById: vi.fn() });
			fetchMock
				.mockResolvedValueOnce({ json: async () => ({ success: true, result: [] }) })
				.mockResolvedValueOnce({ json: async () => ({ success: true }) });
			await ddnsService.updateProvider(
				{
					id: 1,
					provider: "cloudflare",
					domains: ["example.com&type=AAAA"],
					config: { token: "token", zone_id: "zone" },
				},
				{ ipv4: "1.2.3.4", ipv6: null },
			);
			const url = new URL(fetchMock.mock.calls[0][0]);
			expect(url.searchParams.getAll("type")).toEqual(["A"]);
			expect(url.searchParams.get("name")).toBe("example.com&type=AAAA");
		});
		it("does not send an update or report success when the selected WAN address is unavailable", async () => {
			const patchAndFetchById = vi.fn().mockResolvedValue({});
			DdnsProvider.query.mockReturnValue({ patchAndFetchById });
			const result = await ddnsService.updateProvider(
				{
					id: 1,
					name: "IPv6 only",
					provider: "duckdns",
					domains: ["example"],
					config: { token: "test" },
					ip_ver: "v6",
				},
				{ ipv4: "1.1.1.1", ipv6: null },
			);
			expect(result).toEqual({ success: false, error: "No WAN IP available for the selected IP version" });
			expect(fetchMock).not.toHaveBeenCalled();
			expect(patchAndFetchById).toHaveBeenCalledWith(1, { last_error: result.error });
		});

		it("does not request custom URLs targeting the IPv6 loopback address", async () => {
			const patchAndFetchById = vi.fn().mockResolvedValue({});
			DdnsProvider.query.mockReturnValue({
				patchAndFetchById,
			});

			await ddnsService.updateProvider(
				{
					id: 1,
					name: "IPv6 loopback",
					provider: "custom",
					domains: [],
					config: { url: "http://[::1]/update" },
					ip_ver: "dual",
				},
				{ ipv4: "203.0.113.10", ipv6: null },
			);

			expect(fetchMock).not.toHaveBeenCalled();
			expect(patchAndFetchById).toHaveBeenCalledWith(
				1,
				expect.objectContaining({ last_error: "SSRF: Localhost URLs are not allowed" }),
			);
		});

		it.each([
			["cloudflare", {}, "Missing Cloudflare Token or Zone ID"],
			["duckdns", {}, "Missing DuckDNS Token"],
			["custom", {}, "Missing Custom URL"],
			["custom", { url: "invalid-secret-url" }, "Custom DDNS URL is invalid"],
			["unsupported", {}, "Unknown provider: unsupported"],
		])("reports an actionable structured configuration error for %s", async (provider, config, message) => {
			const patchAndFetchById = vi.fn().mockResolvedValue({});
			DdnsProvider.query.mockReturnValue({ patchAndFetchById });
			await expect(
				ddnsService.updateProvider(
					{ id: 1, name: "test", provider, config, domains: ["example.com"] },
					{ ipv4: "1.1.1.1", ipv6: null },
				),
			).resolves.toEqual({ success: false, error: message });
			expect(logger.error.mock.calls.at(-1)[1]).toBeInstanceOf(errs.ConfigurationError);
			expect(logger.error.mock.calls.at(-1)[1]).toMatchObject({ public: true, status: 400 });
			expect(patchAndFetchById).toHaveBeenCalledWith(1, { last_error: message });
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it.each(["duckdns", "cloudflare-list", "cloudflare-update"])(
			"keeps external %s error details out of the returned and persisted status",
			async (failure) => {
				const secret = "provider-credential-canary";
				const patchAndFetchById = vi.fn().mockResolvedValue({});
				DdnsProvider.query.mockReturnValue({ patchAndFetchById });
				if (failure === "duckdns") {
					fetchMock.mockResolvedValue({ ok: false, text: async () => secret });
				} else {
					if (failure === "cloudflare-update") {
						fetchMock.mockResolvedValueOnce({ json: async () => ({ success: true, result: [] }) });
					}
					fetchMock.mockResolvedValueOnce({
						json: async () => ({ success: false, errors: [{ message: secret }] }),
					});
				}
				const result = await ddnsService.updateProvider(
					{
						id: 1,
						name: "test",
						provider: failure === "duckdns" ? "duckdns" : "cloudflare",
						config: { token: "test-token", zone_id: "zone" },
						domains: ["example.com"],
					},
					{ ipv4: "1.1.1.1", ipv6: null },
				);
				expect(result.success).toBe(false);
				expect(JSON.stringify(result)).not.toContain(secret);
				expect(JSON.stringify(patchAndFetchById.mock.calls)).not.toContain(secret);
				const loggedError = logger.error.mock.calls.at(-1)[1];
				expect(loggedError).toBeInstanceOf(errs.InternalError);
				expect(loggedError).toMatchObject({ public: false, status: 500 });
				expect(JSON.stringify(loggedError.previous)).toContain(secret);
			},
		);

		it("does not expose raw transport errors through provider status", async () => {
			const patchAndFetchById = vi.fn().mockResolvedValue({});
			DdnsProvider.query.mockReturnValue({ patchAndFetchById });
			fetchMock.mockRejectedValue(new Error("request failed at https://example.com?token=credential-canary"));
			await expect(
				ddnsService.updateProvider(
					{ id: 1, name: "test", provider: "duckdns", config: { token: "test-token" }, domains: ["example"] },
					{ ipv4: "1.1.1.1", ipv6: null },
				),
			).resolves.toEqual({ success: false, error: "DDNS update failed" });
			expect(patchAndFetchById).toHaveBeenCalledWith(1, { last_error: "DDNS update failed" });
		});

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
});
