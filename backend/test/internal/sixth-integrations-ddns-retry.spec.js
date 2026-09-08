import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ provider: null, patch: vi.fn() }));
vi.mock("../../models/ddns_provider.js", () => ({
	default: { query: () => ({ where: async () => [{ ...state.provider }], patchAndFetchById: state.patch }) },
}));
vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), debug: vi.fn(), error: vi.fn() } }));

import ddns from "../../internal/ddns.js";

describe("DDNS retries failed configuration updates", () => {
	beforeEach(() => {
		state.provider = {
			id: 1,
			name: "changed domain",
			provider: "duckdns",
			domains: ["new-domain"],
			config: { token: "test-token" },
			ip_ver: "v4",
			last_ipv4: "1.1.1.1",
			last_error: null,
		};
		state.patch.mockImplementation(async (_id, data) => Object.assign(state.provider, data));
	});
	afterEach(() => vi.unstubAllGlobals());

	it("retries on the next interval after a forced update fails with an unchanged WAN address", async () => {
		let updateAttempts = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url) => {
				if (url.includes("api.ipify")) return { ok: true, json: async () => ({ ip: "1.1.1.1" }) };
				if (url.includes("api6.ipify")) return { ok: false };
				updateAttempts++;
				return { ok: true, text: async () => (updateAttempts === 1 ? "KO" : "OK") };
			}),
		);
		await ddns.process(true);
		expect(state.provider.last_error).toBe("DuckDNS Error: KO");
		await ddns.process();
		expect(updateAttempts).toBe(2);
		expect(state.provider.last_error).toBeNull();
		await ddns.process();
		expect(updateAttempts).toBe(2);
	});
});
