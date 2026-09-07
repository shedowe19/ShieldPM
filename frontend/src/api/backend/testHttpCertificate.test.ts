import { afterEach, expect, it, vi } from "vitest";
import { testHttpCertificate } from "./testHttpCertificate";

afterEach(() => vi.unstubAllGlobals());
it("preserves hyphenated domains in HTTP challenge results", async () => {
	const result = { "my-service.example.com": "ok", "other-host.example.org": "failed" };
	const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
	vi.stubGlobal("fetch", fetchMock);
	expect(await testHttpCertificate(Object.keys(result))).toEqual(result);
	expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({ domains: Object.keys(result) });
});
