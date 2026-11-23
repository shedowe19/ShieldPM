import signale from "signale";

const opts = {
	logLevel: "info",
};

/**
 * Central log redaction.
 *
 * Logs are shipped to `docker logs`, journald, SIEM systems and support bundles.
 * They are therefore treated as a public artifact: a credential that reaches a
 * log line is considered disclosed. Every logger below passes its arguments
 * through `redact()` before signale serializes them, so a caller that logs a
 * request payload (e.g. `lib/access.js` on a failed permission check) can never
 * write a password, token, cookie or API key to disk.
 *
 * Rules:
 * - Field names are matched case-insensitively in snake_case and camelCase
 *   (`apiKey`, `api_key`, `x-auth-token`, `clientSecret`, ...).
 * - Private-key blocks, bearer/basic credentials, JWTs, common provider key
 *   formats and `keys.json` material are redacted inside strings.
 * - Values are never truncated or partially echoed: a short secret is still a
 *   secret. Only the field name and the fact that a value existed remain.
 */
export const REDACTED = "[REDACTED]";
const REDACTED_PRIVATE_KEY = "[REDACTED PRIVATE KEY]";
const MAX_DEPTH = 8;

const SECRET_NAME_PATTERN =
	/(?:^|[_-])(password|passwd|passphrase|secret|token|credential|credentials|api[_-]?key|private[_-]?key|preshared[_-]?key|encryption[_-]?key)(?:$|[_-])/i;

const NON_SECRET_NAME_PATTERN = /^(?:has_|is_|.*_configured$)/i;

const toSnakeCase = (value) => value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** True for field names whose value must never be logged. */
export const isSecretFieldName = (name) => {
	if (typeof name !== "string" || !name) return false;
	if (NON_SECRET_NAME_PATTERN.test(name)) return false;
	if (/^(?:authorization|cookie|set[_-]?cookie|session|session[_-]?id)$/i.test(name)) return true;
	if (/^(?:key|keys)$/i.test(name)) return true;
	return SECRET_NAME_PATTERN.test(name) || SECRET_NAME_PATTERN.test(toSnakeCase(name));
};

const PRIVATE_KEY_BLOCK =
	/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g;
const BEARER_OR_BASIC = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}/g;
const PROVIDER_KEY =
	/\b(?:sk-[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g;
const KEYS_JSON_VALUE = /("?(?:encryptionKey|privateKey|private_key|key)"?\s*[:=]\s*")([^"]*)(")/g;
const LONG_HEX_SECRET = /\b[a-f0-9]{64}\b/gi;

/** Redacts credentials that appear inside an arbitrary string. */
export const redactText = (value) => {
	if (typeof value !== "string") return value;
	return value
		.replace(PRIVATE_KEY_BLOCK, REDACTED_PRIVATE_KEY)
		.replace(KEYS_JSON_VALUE, `$1${REDACTED}$3`)
		.replace(BEARER_OR_BASIC, `$1 ${REDACTED}`)
		.replace(JWT, REDACTED)
		.replace(PROVIDER_KEY, REDACTED)
		.replace(LONG_HEX_SECRET, REDACTED);
};

const redactError = (error) => {
	const result = {
		name: error.name,
		message: redactText(error.message),
	};
	if (error.code !== undefined) result.code = error.code;
	if (error.status !== undefined) result.status = error.status;
	if (error.stack) result.stack = redactText(error.stack);
	return result;
};

const redactValue = (value, depth, seen) => {
	if (value === null || value === undefined) return value;
	if (typeof value === "string") return redactText(value);
	if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return value;
	if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
	if (typeof value === "symbol") return value.toString();
	if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
	if (value instanceof Date) return value.toISOString();

	if (typeof value === "object") {
		if (seen.has(value)) return "[Circular]";
		if (depth > MAX_DEPTH) return "[Object]";
		seen.add(value);
		try {
			if (value instanceof Error) return redactError(value);
			if (Array.isArray(value)) return value.map((entry) => redactValue(entry, depth + 1, seen));
			return Object.fromEntries(
				Object.entries(value).map(([key, entry]) => [
					key,
					isSecretFieldName(key) && entry !== undefined && entry !== null && entry !== ""
						? REDACTED
						: redactValue(entry, depth + 1, seen),
				]),
			);
		} finally {
			seen.delete(value);
		}
	}
	return String(value);
};

/**
 * Returns a log-safe copy of `value`. The input is never mutated.
 * @param {any} value
 * @returns {any}
 */
export const redact = (value) => {
	try {
		return redactValue(value, 0, new WeakSet());
	} catch {
		return "[UNSERIALIZABLE]";
	}
};

/** Redacts every argument of a logger call. */
export const redactArgs = (args) => args.map((arg) => redact(arg));

const createLogger = (scope) => {
	const instance = new signale.Signale({ scope, ...opts });
	// Only logger methods are wrapped; configuration/state access still works.
	return new Proxy(instance, {
		get(target, property) {
			const value = Reflect.get(target, property, target);
			if (typeof value !== "function") return value;
			if (!Object.hasOwn(target, property)) return value.bind(target);
			return (...args) => value.apply(target, redactArgs(args));
		},
	});
};

const global = createLogger("Global   ");
const migrate = createLogger("Migrate  ");
const express = createLogger("Express  ");
const access = createLogger("Access   ");
const nginx = createLogger("Nginx    ");
const ssl = createLogger("SSL      ");
const certbot = createLogger("Certbot  ");
const importer = createLogger("Importer ");
const setup = createLogger("Setup    ");
const ipRanges = createLogger("IP Ranges");
const remoteVersion = createLogger("Remote Version");
const oidc = createLogger("OIDC");
const analytics = createLogger("Analytics");
const internal = createLogger("Internal ");

const debug = (logger, ...args) => {
	logger.debug(...redactArgs(args));
};

export {
	access,
	analytics,
	certbot,
	debug,
	express,
	global,
	importer,
	internal,
	ipRanges,
	migrate,
	nginx,
	oidc,
	remoteVersion,
	setup,
	ssl,
};
