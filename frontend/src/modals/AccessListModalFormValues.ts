import type { AccessList } from "src/api/backend";
import { ACCESS_LIST_AUTH_TYPE } from "src/types/enums";

export interface AccessListFormValues extends Partial<AccessList> {
	authType?: string;
	authentikHost?: string;
	oauth2ProxyHost?: string;
	oauth2Provider?: string;
	oauth2ClientId?: string;
	oauth2ClientSecret?: string;
	oauth2CookieSecret?: string;
	oauth2OidcIssuerUrl?: string;
	oauth2ProxyPrefix?: string;
	oauth2Scope?: string;
	oauth2AllowedGroups?: string;
	oauth2AllowedEmails?: string;
	oauth2AllowedEmailDomains?: string;
	oauth2InsecureOidcAllowUnverifiedEmail?: boolean;
	oidcDiscoveryUrl?: string;
	oidcClientId?: string;
	oidcClientSecret?: string;
	mtlsEnabled?: boolean;
	mtlsContent?: string;
	mtlsUseInternal?: boolean;
}

type AccessListMeta = {
	auth_type?: string;
	authType?: string;
	authentik_host?: string;
	authentikHost?: string;
	oauth2_allowed_email_domains?: string;
	oauth2AllowedEmailDomains?: string;
	oauth2_allowed_emails?: string;
	oauth2AllowedEmails?: string;
	oauth2_allowed_groups?: string;
	oauth2AllowedGroups?: string;
	oauth2_client_id?: string;
	oauth2ClientId?: string;
	oauth2_client_secret?: string;
	oauth2ClientSecret?: string;
	oauth2_cookie_secret?: string;
	oauth2CookieSecret?: string;
	oauth2_insecure_oidc_allow_unverified_email?: boolean;
	oauth2InsecureOidcAllowUnverifiedEmail?: boolean;
	oauth2_oidc_issuer_url?: string;
	oauth2OidcIssuerUrl?: string;
	oauth2_provider?: string;
	oauth2Provider?: string;
	oauth2_proxy_host?: string;
	oauth2ProxyHost?: string;
	oauth2_proxy_prefix?: string;
	oauth2ProxyPrefix?: string;
	oauth2_scope?: string;
	oauth2Scope?: string;
	oidc_client_id?: string;
	oidcClientId?: string;
	oidc_client_secret?: string;
	oidcClientSecret?: string;
	oidc_discovery_url?: string;
	oidcDiscoveryUrl?: string;
};

const isAccessListMeta = (value: unknown): value is AccessListMeta => typeof value === "object" && value !== null;

const parseAccessListMeta = (meta: unknown): AccessListMeta => {
	if (!meta) return {};

	if (typeof meta === "string") {
		try {
			const parsed: unknown = JSON.parse(meta);
			return isAccessListMeta(parsed) ? parsed : {};
		} catch (error) {
			console.error("Failed to parse access list meta:", error);
			return {};
		}
	}

	return isAccessListMeta(meta) ? meta : {};
};

export const createAccessListInitialValues = (data: Partial<AccessList> = {}): AccessListFormValues => {
	const meta = parseAccessListMeta(data.meta);
	const initialAuthType =
		meta.auth_type ||
		meta.authType ||
		(meta.authentik_host || meta.authentikHost
			? ACCESS_LIST_AUTH_TYPE.AUTHENTIK_PROXY
			: meta.oauth2_proxy_host || meta.oauth2ProxyHost
				? ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY
				: ACCESS_LIST_AUTH_TYPE.NONE);

	return {
		name: data.name,
		satisfyAny: data.satisfyAny,
		passAuth: data.passAuth,
		items: data.items || [],
		clients: data.clients || [],
		authType: initialAuthType,
		authentikHost: meta.authentik_host || meta.authentikHost || "",
		oauth2Provider: meta.oauth2_provider || meta.oauth2Provider || "google",
		oauth2ClientId: meta.oauth2_client_id || meta.oauth2ClientId || "",
		oauth2ClientSecret: meta.oauth2_client_secret || meta.oauth2ClientSecret || "",
		oauth2CookieSecret: meta.oauth2_cookie_secret || meta.oauth2CookieSecret || "",
		oauth2OidcIssuerUrl: meta.oauth2_oidc_issuer_url || meta.oauth2OidcIssuerUrl || "",
		oauth2ProxyPrefix: meta.oauth2_proxy_prefix || meta.oauth2ProxyPrefix || "/oauth2/",
		oauth2Scope: meta.oauth2_scope || meta.oauth2Scope || "",
		oauth2AllowedGroups: meta.oauth2_allowed_groups || meta.oauth2AllowedGroups || "",
		oauth2AllowedEmails: meta.oauth2_allowed_emails || meta.oauth2AllowedEmails || "",
		oauth2AllowedEmailDomains: meta.oauth2_allowed_email_domains || meta.oauth2AllowedEmailDomains || "",
		oauth2InsecureOidcAllowUnverifiedEmail: !!(
			meta.oauth2_insecure_oidc_allow_unverified_email || meta.oauth2InsecureOidcAllowUnverifiedEmail
		),
		oidcDiscoveryUrl: meta.oidc_discovery_url || meta.oidcDiscoveryUrl || "",
		oidcClientId: meta.oidc_client_id || meta.oidcClientId || "",
		oidcClientSecret: meta.oidc_client_secret || meta.oidcClientSecret || "",
		mtlsEnabled: !!data.mtlsEnabled,
		mtlsContent: data.mtlsCertificate || "",
		mtlsUseInternal: !!data.mtlsUseInternal,
	};
};
