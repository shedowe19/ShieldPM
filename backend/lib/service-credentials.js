import _ from "lodash";

const ssoSecretFields = {
	oauth2_client_secret: "oauth2ClientSecret",
	oauth2_cookie_secret: "oauth2CookieSecret",
	oidc_client_secret: "oidcClientSecret",
};

const normalizeMeta = (value) => {
	if (typeof value === "string") {
		try {
			return normalizeMeta(JSON.parse(value));
		} catch {
			return {};
		}
	}
	return value && typeof value === "object" && !Array.isArray(value) ? value : {};
};

/** Public responses describe configured credentials without transferring their values. */
export const publicCloudflaredTunnel = (tunnel) => ({
	..._.omit(tunnel, ["token"]),
	has_token: Boolean(tunnel.token),
});

/** A custom DDNS URL can contain credentials in its path, query or userinfo. */
export const publicDdnsProvider = (provider) => ({
	...provider,
	config: provider.provider === "cloudflare" ? _.pick(provider.config, ["zone_id"]) : {},
	has_credentials: Boolean(provider.provider === "custom" ? provider.config?.url : provider.config?.token),
});

export const publicAccessListCredentials = (meta) => {
	const saved = normalizeMeta(meta);
	return {
		meta: _.omit(saved, [...Object.keys(ssoSecretFields), ...Object.values(ssoSecretFields)]),
		credentials_configured: Object.fromEntries(
			Object.entries(ssoSecretFields).map(([field, alias]) => [field, Boolean(saved[field] || saved[alias])]),
		),
	};
};

/** Blank/omitted secret inputs preserve the saved value; a supplied replacement wins. */
export const preserveAccessListCredentials = (incoming, existing = {}) => {
	const meta = { ...incoming };
	const savedMeta = normalizeMeta(existing);
	for (const [field, alias] of Object.entries(ssoSecretFields)) {
		const replacement = incoming[field] || incoming[alias];
		const saved = savedMeta[field] || savedMeta[alias];
		delete meta[alias];
		if (replacement || saved) meta[field] = replacement || saved;
		else delete meta[field];
	}
	return meta;
};

export const preserveDdnsCredentials = (incoming, existing) => {
	const provider = incoming.provider || existing.provider;
	if (!incoming.config && provider === existing.provider) return incoming;
	const config = { ...(provider === existing.provider ? existing.config : {}), ...incoming.config };
	const field = provider === "custom" ? "url" : "token";
	if (!config[field] && provider === existing.provider && existing.config?.[field]) {
		config[field] = existing.config[field];
	}
	return { ...incoming, config };
};
