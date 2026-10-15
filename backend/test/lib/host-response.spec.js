import { describe, expect, it } from "vitest";
import { sanitizeProxyHost } from "../../lib/host-response.js";

describe("expanded host access-list credentials", () => {
	const secret = "synthetic-sso-credential";
	const meta = {
		auth_type: "oauth2_proxy",
		oauth2_client_id: "public-client",
		oauth2_client_secret: secret,
		oauth2_cookie_secret: secret,
		oidc_client_secret: secret,
		oauth2ClientSecret: secret,
		oauth2CookieSecret: secret,
		oidcClientSecret: secret,
	};
	it.each([meta, JSON.stringify(meta), JSON.stringify(JSON.stringify(meta))])(
		"normalizes object and legacy serialized metadata before redaction: %j",
		(value) => {
			const input = {
				id: 4,
				access_list: { id: 2, meta: value, items: [{ username: "user", password: secret }] },
			};
			const result = sanitizeProxyHost(input);
			expect(result.access_list.meta).toEqual({ auth_type: "oauth2_proxy", oauth2_client_id: "public-client" });
			expect(result.access_list.credentials_configured).toEqual({
				oauth2_client_secret: true,
				oauth2_cookie_secret: true,
				oidc_client_secret: true,
			});
			expect(result.access_list.items).toEqual([{ username: "user" }]);
			expect(JSON.stringify(result)).not.toContain(secret);
			expect(input.access_list.meta).toEqual(value);
			expect(input.access_list.items[0].password).toBe(secret);
		},
	);
	it.each([null, "invalid-json", "[]", "null"])("does not expose malformed metadata: %j", (meta) => {
		expect(sanitizeProxyHost({ access_list: { meta } }).access_list.meta).toEqual({});
	});
});
