import _ from "lodash";
import { readRetiredHostMetadata, retiredHostMetadataFields } from "./retired-host-metadata.js";

/**
 * Field names whose values are credential material. Kept local to this module
 * (instead of importing logger.js) so response helpers stay usable in tests and
 * do not depend on the logging stack.
 */
const SECRET_NAME_PATTERN =
	/(?:^|[_-])(password|passwd|passphrase|secret|token|credential|credentials|api[_-]?key|private[_-]?key|preshared[_-]?key|encryption[_-]?key)(?:$|[_-])/i;

const NON_SECRET_NAME_PATTERN = /^(?:has_|is_|.*_configured$)/i;

const toSnakeCase = (value) => value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** True for field names whose value must never be returned or exported. */
export const isSecretFieldName = (name) => {
	if (typeof name !== "string" || !name) return false;
	if (NON_SECRET_NAME_PATTERN.test(name)) return false;
	if (/^(?:authorization|cookie|set[_-]?cookie|session|session[_-]?id)$/i.test(name)) return true;
	if (/^(?:key|keys)$/i.test(name)) return true;
	return SECRET_NAME_PATTERN.test(name) || SECRET_NAME_PATTERN.test(toSnakeCase(name));
};

/**
 * Secrets that must never leave a host response (API, audit metadata, expanded
 * relations). The list is intentionally broader than the columns that exist
 * today: aliases and legacy names are removed as well, so a stored legacy
 * payload cannot reappear through an expand.
 */
const HOST_SECRET_FIELDS = [
	"dns_provider_credentials",
	"dnsProviderCredentials",
	"git_credentials",
	"gitCredentials",
	"terminal_password",
	"terminalPassword",
	"terminal_private_key",
	"terminalPrivateKey",
	"oauth2_client_secret",
	"oauth2ClientSecret",
	"oauth2_cookie_secret",
	"oauth2CookieSecret",
	"oidc_client_secret",
	"oidcClientSecret",
];

const isHostSecretField = (name) => HOST_SECRET_FIELDS.includes(name) || isSecretFieldName(name);

const normalizeMeta = (value) => {
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
		} catch {
			return {};
		}
	}
	return value && typeof value === "object" && !Array.isArray(value) ? value : {};
};

/** Removes secret-named keys at every depth; never mutates the input. */
const omitSecretFields = (value, depth = 0) => {
	if (Array.isArray(value)) return value.map((entry) => omitSecretFields(entry, depth + 1));
	if (!value || typeof value !== "object" || depth > 8) return value;
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => !isHostSecretField(key))
			.map(([key, entry]) => [key, omitSecretFields(entry, depth + 1)]),
	);
};

/**
 * A repository URL may embed a PAT in its userinfo or query string. Those
 * credentials belong in `git_credentials`; the URL returned to clients must be
 * a plain locator so it cannot leak through HAR files or support bundles.
 */
export const redactRepositoryUrl = (value) => {
	if (typeof value !== "string" || value === "") return value;
	try {
		const url = new URL(value);
		let changed = false;
		if (url.username || url.password) {
			url.username = "";
			url.password = "";
			changed = true;
		}
		for (const name of ["access_token", "token", "private_token", "password", "auth"]) {
			if (url.searchParams.has(name)) {
				url.searchParams.delete(name);
				changed = true;
			}
		}
		return changed ? url.toString() : value;
	} catch {
		// Not an absolute URL (for example scp-like SSH syntax) — nothing to strip.
		return value;
	}
};

// DNS credentials belong to the certificate, never to host responses or audit history.
export const sanitizeHostMeta = (meta) =>
	omitSecretFields(
		_.omit(readRetiredHostMetadata(meta), [
			"dns_provider_credentials",
			"dnsProviderCredentials",
			...retiredHostMetadataFields,
		]),
	);

/** Remove connection credentials from a host returned through APIs or audit metadata. */
export const sanitizeProxyHost = (host) => {
	const row = _.omit(host, ["is_deleted", "maintenance_pending", "owner.is_deleted", ...HOST_SECRET_FIELDS]);
	if (row.meta) row.meta = sanitizeHostMeta(row.meta);
	if (row.git_repo_url) row.git_repo_url = redactRepositoryUrl(row.git_repo_url);
	if (row.forward_host?.startsWith("/data/websites/")) {
		row.forward_host = "(managed)";
	}
	if (row.certificate) {
		row.certificate = { ...row.certificate, meta: {} };
	}
	if (row.access_list) {
		row.access_list = {
			...row.access_list,
			meta: omitSecretFields(normalizeMeta(row.access_list.meta)),
		};
		if (Array.isArray(row.access_list.items)) {
			row.access_list.items = row.access_list.items.map((item) => _.omit(item, ["password"]));
		}
	}
	return row;
};
