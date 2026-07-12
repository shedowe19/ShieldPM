import type { AccessListItem } from "src/api/backend";
import { intl } from "src/locale";
import { ACCESS_LIST_AUTH_TYPE } from "src/types/enums";
import type { AccessListFormValues } from "./AccessListModalFormValues";

export const validateAccessListForm = (values: AccessListFormValues): string | null => {
	if (
		values.items?.length === 0 &&
		values.clients?.length === 0 &&
		!values.authentikHost &&
		values.authType !== ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY &&
		values.authType !== ACCESS_LIST_AUTH_TYPE.OIDC &&
		!values.mtlsEnabled
	) {
		return intl.formatMessage({ id: "error.access.at-least-one" });
	}

	if (values.authType === ACCESS_LIST_AUTH_TYPE.OIDC) {
		if (!values.oidcClientId) return "Client ID is required";
		if (!values.oidcClientSecret) return "Client Secret is required";
		if (!values.oidcDiscoveryUrl) return "Discovery URL is required";
	}

	if (values.authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY) {
		if (!values.oauth2ClientId) return "Client ID is required";
		if (!values.oauth2ClientSecret) return "Client Secret is required";
		if (!values.oauth2CookieSecret) return "Cookie Secret is required";
		if (values.oauth2Provider === "oidc" && !values.oauth2OidcIssuerUrl) {
			return "OIDC Issuer URL is required for OIDC provider";
		}
	}

	if (values.mtlsEnabled && !values.mtlsUseInternal && !values.mtlsContent) {
		return intl.formatMessage({ id: "error.access.mtls_content_required" });
	}

	const usernames = (values.items || []).map((item: AccessListItem) => item.username);
	if (usernames.length !== new Set(usernames).size) {
		return intl.formatMessage({ id: "error.access.duplicate-usernames" });
	}

	return null;
};
