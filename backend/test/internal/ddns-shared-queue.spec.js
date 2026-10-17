import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ provider: null }));
vi.mock("../../models/ddns_provider.js", () => ({
	default: {
		query: () => {
			const query = {
				where: () => query,
				first: async () => ({ ...state.provider }),
				patchAndFetchById: async (_id, data) => Object.assign(state.provider, data),
				// biome-ignore lint/suspicious/noThenProperty: Objection queries are thenable.
				then: (resolve, reject) => Promise.resolve([{ ...state.provider }]).then(resolve, reject),
			};
			return query;
		},
	},
}));
vi.mock("../../internal/audit-log.js", () => ({ default: {} }));
vi.mock("../../internal/gitops.js", () => ({ default: {} }));
vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), debug: vi.fn(), error: vi.fn() } }));

import ddns from "../../internal/ddns.js";
import providers from "../../internal/ddns-provider.js";

afterEach(() => vi.unstubAllGlobals());
it("serializes delayed manual tests and newer scheduled updates", async () => {
	state.provider = {
		id: 1,
		name: "site",
		provider: "duckdns",
		domains: ["site"],
		config: { token: "synthetic-token" },
		ip_ver: "v4",
		enabled: 1,
	};
	const writes = [];
	let ipv4Calls = 0;
	let finishOld;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url) => {
			if (url.includes("api.ipify")) {
				ipv4Calls++;
				return { ok: true, json: async () => ({ ip: `1.1.1.${ipv4Calls}` }) };
			}
			if (url.includes("api6.ipify")) return { ok: true, json: async () => ({ ip: "2001:db8::1" }) };
			const address = new URL(url).searchParams.get("ip");
			if (address === "1.1.1.1")
				return new Promise((resolve) => {
					finishOld = () => {
						writes.push(address);
						resolve({ ok: true, text: async () => "OK" });
					};
				});
			writes.push(address);
			return { ok: true, text: async () => "OK" };
		}),
	);
	const manual = providers.test({ can: async () => ({ permission_visibility: "all" }) }, { id: 1 });
	await vi.waitFor(() => expect(finishOld).toBeTypeOf("function"));
	const scheduled = ddns.process(true);
	await vi.waitFor(() => expect(ipv4Calls).toBe(2));
	expect(writes).toEqual([]);
	finishOld();
	await scheduled;
	await expect(manual).resolves.toMatchObject({ status: "success" });
	expect(writes).toEqual(["1.1.1.1", "1.1.1.2"]);
	expect(state.provider.last_ipv4).toBe("1.1.1.2");
});

it("does not let an older slow WAN read replace a newer completed measurement", async () => {
	const oldResponse = Promise.withResolvers();
	let calls = 0;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url) => {
			if (url.includes("api.ipify")) {
				calls++;
				if (calls === 1) return oldResponse.promise;
				return { ok: true, json: async () => ({ ip: "8.8.4.4" }) };
			}
			return { ok: true, json: async () => ({ ip: "2001:db8::2" }) };
		}),
	);
	const older = ddns.getWanIps();
	await vi.waitFor(() => expect(calls).toBe(1));
	const fresh = await ddns.getWanIps();
	expect(fresh).toMatchObject({ ipv4: "8.8.4.4" });
	oldResponse.resolve({ ok: true, json: async () => ({ ip: "1.1.1.1" }) });
	await expect(older).resolves.toEqual(fresh);
});
