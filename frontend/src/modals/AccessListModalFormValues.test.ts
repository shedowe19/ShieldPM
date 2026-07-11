import type { AccessList } from "src/api/backend";
import { ACCESS_LIST_AUTH_TYPE } from "src/types/enums";
import { describe, expect, it } from "vitest";
import { createAccessListInitialValues } from "./AccessListModalFormValues";

describe("createAccessListInitialValues", () => {
	it("keeps null legacy metadata safe while initializing every Access List form field", () => {
		expect(
			createAccessListInitialValues({
				meta: "null",
			} as unknown as Partial<AccessList>),
		).toStrictEqual({
			authType: ACCESS_LIST_AUTH_TYPE.NONE,
			authentikHost: "",
			clients: [],
			items: [],
			mtlsContent: "",
			mtlsEnabled: false,
			mtlsUseInternal: false,
			name: undefined,
			oauth2AllowedEmailDomains: "",
			oauth2AllowedEmails: "",
			oauth2AllowedGroups: "",
			oauth2ClientId: "",
			oauth2ClientSecret: "",
			oauth2CookieSecret: "",
			oauth2InsecureOidcAllowUnverifiedEmail: false,
			oauth2OidcIssuerUrl: "",
			oauth2Provider: "google",
			oauth2ProxyPrefix: "/oauth2/",
			oauth2Scope: "",
			oidcClientId: "",
			oidcClientSecret: "",
			oidcDiscoveryUrl: "",
			passAuth: undefined,
			satisfyAny: undefined,
		});
	});

	it("preserves configured OAuth2 and mTLS values from legacy snake-case metadata", () => {
		const accessList = {
			clients: [{ address: "10.0.0.0/24", directive: "allow" }],
			items: [{ password: "unchanged", username: "admin" }],
			meta: JSON.stringify({
				auth_type: ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY,
				oauth2_allowed_email_domains: "example.test",
				oauth2_allowed_emails: "admin@example.test",
				oauth2_allowed_groups: "admins",
				oauth2_client_id: "client-id",
				oauth2_client_secret: "client-secret",
				oauth2_cookie_secret: "cookie-secret",
				oauth2_insecure_oidc_allow_unverified_email: true,
				oauth2_oidc_issuer_url: "https://id.example.test",
				oauth2_provider: "oidc",
				oauth2_proxy_prefix: "/auth/",
				oauth2_scope: "openid profile",
			}),
			mtlsCertificate: "-----BEGIN CERTIFICATE-----",
			mtlsEnabled: true,
			mtlsUseInternal: true,
			name: "Protected application",
			passAuth: true,
			satisfyAny: true,
		} as unknown as Partial<AccessList>;

		expect(createAccessListInitialValues(accessList)).toMatchObject({
			authType: ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY,
			authentikHost: "",
			clients: [{ address: "10.0.0.0/24", directive: "allow" }],
			items: [{ password: "unchanged", username: "admin" }],
			mtlsContent: "-----BEGIN CERTIFICATE-----",
			mtlsEnabled: true,
			mtlsUseInternal: true,
			name: "Protected application",
			oauth2AllowedEmailDomains: "example.test",
			oauth2AllowedEmails: "admin@example.test",
			oauth2AllowedGroups: "admins",
			oauth2ClientId: "client-id",
			oauth2ClientSecret: "client-secret",
			oauth2CookieSecret: "cookie-secret",
			oauth2InsecureOidcAllowUnverifiedEmail: true,
			oauth2OidcIssuerUrl: "https://id.example.test",
			oauth2Provider: "oidc",
			oauth2ProxyPrefix: "/auth/",
			oauth2Scope: "openid profile",
			passAuth: true,
			satisfyAny: true,
		});
	});
});
