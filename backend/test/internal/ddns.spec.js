import { beforeEach, describe, expect, it, vi } from "vitest";
import ddnsService from "../../internal/ddns.js";
import DdnsProvider from "../../models/ddns_provider.js";

vi.mock("../../models/ddns_provider.js", () => ({
	default: {
		query: vi.fn(),
	},
}));

vi.mock("../../logger.js", () => ({
	global: {
		info: vi.fn(),
		error: vi.fn(),
		success: vi.fn(),
		debug: vi.fn(),
	},
}));

const fetchMock = vi.fn();
global.fetch = fetchMock;

const mockResponse = (body, { ok = true, status = 200, headers = {} } = {}) => ({
	ok,
	status,
	headers: { get: (name) => headers[name.toLowerCase()] ?? null },
	body: null,
	text: vi.fn().mockResolvedValue(body),
});

const provider = (overrides = {}) => ({
	id: 1,
	name: "Test DDNS",
	provider: "cloudflare",
	domains: ["example.com"],
	config: { token: "cloudflare-token", zone_id: "zone-id" },
	last_ipv4: "1.1.1.1",
	last_ipv6: null,
	ip_ver: "dual",
	...overrides,
});

describe("DDNS service", () => {
	beforeEach(async () => {
		await ddnsService.stop();
		vi.clearAllMocks();
	});

	describe("getWanIps", () => {
		it("returns only validated public IPv4 and IPv6 responses", async () => {
			fetchMock
				.mockResolvedValueOnce(mockResponse(JSON.stringify({ ip: "1.2.3.4" })))
				.mockResolvedValueOnce(mockResponse(JSON.stringify({ ip: "2606:4700:4700::1111" })));

			await expect(ddnsService.getWanIps()).resolves.toEqual({
				ipv4: "1.2.3.4",
				ipv6: "2606:4700:4700::1111",
			});
			expect(fetchMock).toHaveBeenNthCalledWith(
				1,
				"https://api.ipify.org?format=json",
				expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }),
			);
			expect(fetchMock).toHaveBeenNthCalledWith(
				2,
				"https://api6.ipify.org?format=json",
				expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }),
			);
		});

		it("isolates failures and rejects private or wrong-family answers", async () => {
			fetchMock
				.mockResolvedValueOnce(mockResponse(JSON.stringify({ ip: "10.0.0.4" })))
				.mockResolvedValueOnce(mockResponse(JSON.stringify({ ip: "1.2.3.4" })));

			await expect(ddnsService.getWanIps()).resolves.toEqual({ ipv4: null, ipv6: null });
		});
	});

	describe("updateProvider", () => {
		it("rejects a custom callback to an IPv6 loopback and persists a safe error", async () => {
			const patchAndFetchById = vi.fn().mockResolvedValue({});
			DdnsProvider.query.mockReturnValue({ patchAndFetchById });

			await expect(
				ddnsService.updateProvider(
					provider({
						provider: "custom",
						config: { url: "https://[::1]/update?token=secret-value" },
					}),
					{ ipv4: "8.8.8.8", ipv6: null },
				),
			).rejects.toThrow("Private, local, reserved, and metadata addresses are not allowed");

			expect(fetchMock).not.toHaveBeenCalled();
			expect(patchAndFetchById).toHaveBeenCalledWith(
				1,
				expect.objectContaining({
					last_error: "SSRF: Private, local, reserved, and metadata addresses are not allowed",
				}),
			);
		});

		it("updates existing and missing Cloudflare records with exact methods and bodies", async () => {
			fetchMock.mockImplementation(async (input, options = {}) => {
				const url = new URL(input);
				const method = options.method || "GET";
				if (method === "GET") {
					const type = url.searchParams.get("type");
					return mockResponse(
						JSON.stringify({
							success: true,
							result: type === "A" ? [{ id: "record-a", proxied: true }] : [],
						}),
					);
				}
				return mockResponse(JSON.stringify({ success: true }));
			});
			const patchAndFetchById = vi.fn().mockResolvedValue({});
			DdnsProvider.query.mockReturnValue({ patchAndFetchById });

			await expect(
				ddnsService.updateProvider(provider(), {
					ipv4: "8.8.8.8",
					ipv6: "2606:4700:4700::1111",
				}),
			).resolves.toBe("Updated 2 record(s)");

			const calls = fetchMock.mock.calls.map(([input, options]) => ({ url: new URL(input), options }));
			const put = calls.find(({ options }) => options.method === "PUT");
			const post = calls.find(({ options }) => options.method === "POST");
			expect(put.url.pathname.endsWith("/dns_records/record-a")).toBe(true);
			expect(JSON.parse(put.options.body)).toEqual({
				type: "A",
				name: "example.com",
				content: "8.8.8.8",
				ttl: 1,
				proxied: true,
			});
			expect(post.url.pathname.endsWith("/dns_records")).toBe(true);
			expect(JSON.parse(post.options.body)).toEqual({
				type: "AAAA",
				name: "example.com",
				content: "2606:4700:4700::1111",
				ttl: 1,
				proxied: false,
			});
			for (const { options } of calls) {
				expect(options).toEqual(
					expect.objectContaining({
						redirect: "error",
						headers: expect.objectContaining({ Authorization: "Bearer cloudflare-token" }),
					}),
				);
			}
			expect(patchAndFetchById).toHaveBeenCalledWith(
				1,
				expect.objectContaining({
					last_ipv4: "8.8.8.8",
					last_ipv6: "2606:4700:4700::1111",
					last_error: null,
				}),
			);
		});

		it("sends a bounded DuckDNS request with encoded parameters", async () => {
			fetchMock.mockResolvedValueOnce(mockResponse("OK\n"));
			const patchAndFetchById = vi.fn().mockResolvedValue({});
			DdnsProvider.query.mockReturnValue({ patchAndFetchById });

			await expect(
				ddnsService.updateProvider(
					provider({
						provider: "duckdns",
						domains: ["one", "two"],
						config: { token: "duck-token" },
					}),
					{ ipv4: "8.8.4.4", ipv6: "2606:4700:4700::1111" },
				),
			).resolves.toBe("Updated OK");

			const [requestUrl, options] = fetchMock.mock.calls[0];
			const url = new URL(requestUrl);
			expect(url.origin + url.pathname).toBe("https://www.duckdns.org/update");
			expect(Object.fromEntries(url.searchParams)).toEqual({
				domains: "one,two",
				token: "duck-token",
				ip: "8.8.4.4",
				ipv6: "2606:4700:4700::1111",
			});
			expect(options).toEqual(expect.objectContaining({ redirect: "error" }));
		});

		it("does not let DuckDNS infer an address when the selected family is unavailable", async () => {
			const patchAndFetchById = vi.fn().mockResolvedValue({});
			DdnsProvider.query.mockReturnValue({ patchAndFetchById });

			await expect(
				ddnsService.updateProvider(
					provider({ provider: "duckdns", config: { token: "duck-token" }, ip_ver: "v6" }),
					{ ipv4: "8.8.8.8", ipv6: null },
				),
			).rejects.toThrow("No public WAN address is available");
			expect(fetchMock).not.toHaveBeenCalled();
		});
	});

	it("coalesces ordinary polls but queues a forced pass without overlap", async () => {
		let releaseFirst;
		const firstGate = new Promise((resolve) => {
			releaseFirst = resolve;
		});
		let calls = 0;
		let active = 0;
		let maximumActive = 0;
		const where = vi.fn(async () => {
			calls += 1;
			active += 1;
			maximumActive = Math.max(maximumActive, active);
			if (calls === 1) await firstGate;
			active -= 1;
			return [];
		});
		DdnsProvider.query.mockImplementation(() => ({ where }));

		const first = ddnsService.process();
		const coalesced = ddnsService.process();
		const forced = ddnsService.process(true);
		expect(coalesced).toBe(first);
		expect(forced).toBe(first);
		expect(where).toHaveBeenCalledTimes(1);

		releaseFirst();
		await first;
		expect(where).toHaveBeenCalledTimes(2);
		expect(maximumActive).toBe(1);
	});
});
