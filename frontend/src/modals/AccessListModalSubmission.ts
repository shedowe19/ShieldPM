import type { AccessList, AccessListClient } from "src/api/backend";
import { ACCESS_LIST_AUTH_TYPE } from "src/types/enums";
import type { AccessListFormValues } from "./AccessListModalFormValues";

type CreateAccessListPayloadParams = {
	id: number | "new";
	meta?: Record<string, unknown>;
	values: AccessListFormValues;
};

export const createAccessListPayload = ({
	id,
	meta = {},
	values,
}: CreateAccessListPayloadParams): Partial<AccessList> => {
	const authType = values.authType === ACCESS_LIST_AUTH_TYPE.NONE ? "" : values.authType;

	return {
		id: id === "new" ? undefined : id,
		name: values.name,
		satisfyAny: values.satisfyAny,
		passAuth: values.passAuth,
		mtlsEnabled: values.mtlsEnabled,
		mtlsUseInternal: values.mtlsUseInternal,
		mtlsCertificate: values.mtlsEnabled && !values.mtlsUseInternal ? values.mtlsContent : "",
		meta: {
			...meta,
			auth_type: authType,
			authentik_host: authType === ACCESS_LIST_AUTH_TYPE.AUTHENTIK_PROXY ? values.authentikHost : undefined,
			oauth2_provider: authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2Provider : undefined,
			oauth2_client_id: authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2ClientId : undefined,
			oauth2_client_secret:
				authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2ClientSecret : undefined,
			oauth2_cookie_secret:
				authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2CookieSecret : undefined,
			oauth2_oidc_issuer_url:
				authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2OidcIssuerUrl : undefined,
			oauth2_proxy_prefix: authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2ProxyPrefix : undefined,
			oauth2_scope: authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2Scope : undefined,
			oauth2_allowed_groups:
				authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2AllowedGroups : undefined,
			oauth2_allowed_emails:
				authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2AllowedEmails : undefined,
			oauth2_allowed_email_domains:
				authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2AllowedEmailDomains : undefined,
			oauth2_insecure_oidc_allow_unverified_email:
				authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY
					? values.oauth2InsecureOidcAllowUnverifiedEmail
					: undefined,
			oidc_discovery_url: authType === ACCESS_LIST_AUTH_TYPE.OIDC ? values.oidcDiscoveryUrl : undefined,
			oidc_client_id: authType === ACCESS_LIST_AUTH_TYPE.OIDC ? values.oidcClientId : undefined,
			oidc_client_secret: authType === ACCESS_LIST_AUTH_TYPE.OIDC ? values.oidcClientSecret : undefined,
		},
		items: (values.items || []).map(({ password, username }) => ({ password, username })),
		clients: (values.clients || []).map(({ address, directive }) => ({
			address,
			directive,
		})) as AccessListClient[],
	};
};
