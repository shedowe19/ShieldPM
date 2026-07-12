import { ACCESS_LIST_AUTH_TYPE } from "src/types/enums";
import { describe, expect, it } from "vitest";
import { type AccessListFormValues, createAccessListInitialValues } from "./AccessListModalFormValues";
import { createAccessListPayload } from "./AccessListModalSubmission";

const createValues = (overrides: Partial<AccessListFormValues> = {}): AccessListFormValues => ({
	...createAccessListInitialValues(),
	clients: [],
	items: [],
	mtlsEnabled: false,
	mtlsUseInternal: false,
	name: "Protected app",
	passAuth: false,
	satisfyAny: false,
	...overrides,
});

describe("createAccessListPayload", () => {
	it("keeps active OIDC metadata while omitting stale OAuth2 fields", () => {
		const payload = createAccessListPayload({
			id: 73,
			meta: { retained: "value" },
			values: createValues({
				authType: ACCESS_LIST_AUTH_TYPE.OIDC,
				oauth2ClientId: "stale-oauth-client",
				oidcClientId: "oidc-client",
				oidcClientSecret: "oidc-secret",
				oidcDiscoveryUrl: "https://id.example.test/.well-known/openid-configuration",
			}),
		});

		expect(payload).toMatchObject({
			id: 73,
			meta: {
				auth_type: ACCESS_LIST_AUTH_TYPE.OIDC,
				oauth2_client_id: undefined,
				oidc_client_id: "oidc-client",
				oidc_client_secret: "oidc-secret",
				oidc_discovery_url: "https://id.example.test/.well-known/openid-configuration",
				retained: "value",
			},
		});
	});

	it("submits only editable client and credential fields while disabling unused mTLS content", () => {
		const payload = createAccessListPayload({
			id: "new",
			meta: {},
			values: createValues({
				clients: [{ address: "10.0.0.0/24", directive: "allow", id: 11 }],
				items: [{ hint: "legacy", password: "password", username: "operator" }],
				mtlsContent: "-----BEGIN CERTIFICATE-----",
				mtlsEnabled: false,
			}),
		});

		expect(payload).toMatchObject({
			clients: [{ address: "10.0.0.0/24", directive: "allow" }],
			id: undefined,
			items: [{ password: "password", username: "operator" }],
			mtlsCertificate: "",
		});
		expect(payload.clients?.[0]).not.toHaveProperty("id");
		expect(payload.items?.[0]).not.toHaveProperty("hint");
	});
});
