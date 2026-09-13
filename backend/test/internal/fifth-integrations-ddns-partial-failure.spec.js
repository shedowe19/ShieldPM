import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ provider: null, patch: vi.fn() }));
vi.mock("../../models/ddns_provider.js", () => ({
	default: { query: () => ({ where: async () => [state.provider], patchAndFetchById: state.patch }) },
}));
vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), debug: vi.fn(), error: vi.fn() } }));

import ddns from "../../internal/ddns.js";

describe("Cloudflare DDNS partial failures preserve update ordering", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("waits for all started DNS writes before replaying a forced refresh after one record fails", async () => {
		state.provider = {
			id: 1,
			name: "site",
			provider: "cloudflare",
			domains: ["site.example"],
			config: { token: "test-token", zone_id: "test-zone" },
			ip_ver: "dual",
		};
		let wanLookups = 0;
		let rejectFirstIpv4;
		let finishFirstIpv6;
		const writtenIpv6 = [];
		const success = () => ({ json: async () => ({ success: true }) });
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url, options) => {
				if (url.includes("api.ipify")) {
					wanLookups++;
					return { ok: true, json: async () => ({ ip: `1.1.1.${wanLookups}` }) };
				}
				if (url.includes("api6.ipify"))
					return { ok: true, json: async () => ({ ip: `2001:db8::${wanLookups}` }) };
				if (!options.method) {
					const type = new URL(url).searchParams.get("type");
					if (wanLookups === 1 && type === "A")
						return new Promise((_resolve, reject) => {
							rejectFirstIpv4 = reject;
						});
					return { json: async () => ({ success: true, result: [{ id: type, proxied: false }] }) };
				}
				const data = JSON.parse(options.body);
				if (data.type === "AAAA" && wanLookups === 1)
					return new Promise((resolve) => {
						finishFirstIpv6 = () => {
							writtenIpv6.push(data.content);
							resolve(success());
						};
					});
				if (data.type === "AAAA") writtenIpv6.push(data.content);
				return success();
			}),
		);
		const first = ddns.process(true);
		await vi.waitFor(() => expect(finishFirstIpv6).toBeTypeOf("function"));
		const forced = ddns.process(true);
		rejectFirstIpv4(new Error("IPv4 record lookup failed"));
		try {
			for (let index = 0; index < 30; index++) await Promise.resolve();
			expect(wanLookups).toBe(1);
		} finally {
			finishFirstIpv6();
			await Promise.all([first, forced]);
		}
		expect(wanLookups).toBe(2);
		expect(writtenIpv6).toEqual(["2001:db8::1", "2001:db8::2"]);
	});
});
