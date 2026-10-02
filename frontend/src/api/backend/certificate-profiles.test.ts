import { afterEach, describe, expect, it, vi } from "vitest";
import { createCertificate } from "./createCertificate";
import { createDeadHost } from "./createDeadHost";
import { createProxyHost } from "./createProxyHost";
import { createRedirectionHost } from "./createRedirectionHost";
import { createStream } from "./createStream";
import type { Certificate, DeadHost, ProxyHost, RedirectionHost, Stream } from "./models";

vi.mock("src/modules/AuthStore", () => ({
	AUTHENTICATION_EXPIRED_EVENT: "shieldpm:authentication-expired",
	default: { csrfToken: "synthetic-csrf", sessionRevision: 1 },
}));

afterEach(() => vi.unstubAllGlobals());

describe("certificate profile API contract", () => {
	const issuancePaths = [
		["certificates", (data: unknown) => createCertificate(data as Certificate)],
		["proxy-hosts", (data: unknown) => createProxyHost(data as ProxyHost)],
		["redirection-hosts", (data: unknown) => createRedirectionHost(data as RedirectionHost)],
		["dead-hosts", (data: unknown) => createDeadHost(data as DeadHost)],
		["streams", (data: unknown) => createStream(data as Stream)],
	] as const;

	it.each(issuancePaths)("sends and receives the stored profile through the %s API", async (path, create) => {
		const response = new Response(JSON.stringify({ id: 1, meta: { letsencrypt_profile: "shortlived" } }), {
			status: 200,
		});
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
		const result = await create({ certificateId: "new", meta: { letsencryptProfile: "shortlived" } });

		const [url, options] = vi.mocked(fetch).mock.calls[0];
		expect(url).toBe(`/api/nginx/${path}`);
		expect(JSON.parse(options?.body as string)).toEqual({
			certificate_id: "new",
			meta: { letsencrypt_profile: "shortlived" },
		});
		expect(result.meta.letsencryptProfile).toBe("shortlived");
	});
});
