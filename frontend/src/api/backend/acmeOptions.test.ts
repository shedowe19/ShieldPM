import { afterEach, describe, expect, it, vi } from "vitest";
import { type AcmeOptionsUpdate, getAcmeOptions, updateAcmeOptions } from "./acmeOptions";

vi.mock("src/modules/AuthStore", () => ({
	AUTHENTICATION_EXPIRED_EVENT: "shieldpm:authentication-expired",
	default: { csrfToken: "synthetic-csrf", sessionRevision: 1 },
}));
afterEach(() => vi.unstubAllGlobals());

const ordinary: AcmeOptionsUpdate = {
	server: "https://ca.example.test/directory",
	email: "admin@example.test",
	accountId: "account-1",
	eabKid: "kid-1",
	agreeTos: true,
	mustStaple: false,
	ocspStapling: false,
	serverTlsVerify: true,
	customOcspStapling: false,
	defaultCertificateId: 7,
};
const wire = {
	server: ordinary.server,
	email: ordinary.email,
	account_id: "account-1",
	eab_kid: "kid-1",
	agree_tos: true,
	must_staple: false,
	ocsp_stapling: false,
	server_tls_verify: true,
	custom_ocsp_stapling: false,
	default_certificate_id: 7,
};

describe("ACME options wire contract", () => {
	it("reads a presence marker instead of exposing an EAB HMAC secret", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...wire, eab_hmac_key_set: true }))),
		);
		expect(await getAcmeOptions()).toEqual({ ...ordinary, eabHmacKeySet: true });
		expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/settings/acme-options");
	});
	it.each([undefined, "synthetic-replacement", null])(
		"sends the deliberate secret action %s and no read-only marker",
		async (secret) => {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...wire, eab_hmac_key_set: secret !== null }))),
			);
			const request = { ...ordinary, ...(secret !== undefined ? { eabHmacKey: secret } : {}) };
			await updateAcmeOptions(request);
			const [url, options] = vi.mocked(fetch).mock.calls[0];
			expect(url).toBe("/api/settings/acme-options");
			expect(options?.method).toBe("PUT");
			expect(JSON.parse(options?.body as string)).toEqual({
				...wire,
				...(secret !== undefined ? { eab_hmac_key: secret } : {}),
			});
		},
	);
});
