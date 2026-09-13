import { afterEach, expect, it, vi } from "vitest";
import { get, put } from "./base";

afterEach(() => vi.unstubAllGlobals());
it("preserves literal header names through a proxy-host read/edit roundtrip", async () => {
	const record = {
		id: 1,
		domain_names: ["example.test"],
		anubis_rules: [
			{
				name: "Header allow rule",
				user_agent: "test.*",
				headers: { "X-Api-Key": "^token$", UserAgent: "^value$", x_custom_header: "^custom$" },
				headers_regex: { "CF-IPCountry": "^DE$" },
			},
		],
	};
	const fetchMock = vi
		.fn()
		.mockImplementation(async (_url: string, _options?: RequestInit) => new Response(JSON.stringify(record)));
	vi.stubGlobal("fetch", fetchMock);
	const host = await get<{
		domainNames: string[];
		anubisRules: { userAgent: string; headers: Record<string, string> }[];
	}>({ url: "/nginx/proxy-hosts/1" });
	expect(host.domainNames).toEqual(["example.test"]);
	expect(host.anubisRules[0].userAgent).toBe("test.*");
	expect(host.anubisRules[0].headers).toEqual(record.anubis_rules[0].headers);
	await put({ url: "/nginx/proxy-hosts/1", data: host });
	expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual(record);
});
