import net from "node:net";
import path from "node:path";
import ipaddr from "ipaddr.js";
import errs from "./error.js";

/**
 * Central validation for values that end up in generated Nginx or Lua code.
 *
 * The API schema is the first line of defence, but host records can also be
 * created by GitOps imports, Docker label discovery, revisions and the AI
 * tools. Validation therefore lives here and is called by every internal host
 * service before a row is written.
 */

const CONTROL_OR_SPACE = /[\p{Cc}\s]/u;
const NGINX_META = /[;{}"'`\\#]/u;
const LUA_META = /[;$]/u;
const BANDWIDTH_LIMIT = /^\d{1,9}[kKmM]?$/u;
const QUERY_VALUE = /^[A-Za-z0-9\-._~!$&'()*+,=:@/?%[\]]*$/u;
const INDEX_FILE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u;
// `$` is excluded: the custom-location template echoes the path into a
// `return 301` directive, where Nginx would expand it as a variable.
const LOCATION_PATH = /^\/[A-Za-z0-9._~!&'()*+,=:@/%-]*$/u;
const SINGLE_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;
const PUBLIC_FQDN =
	/^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;
const PRIVATE_RANGES = new Set([
	"loopback",
	"private",
	"linkLocal",
	"uniqueLocal",
	"carrierGradeNat",
	"reserved",
	"broadcast",
	"multicast",
	"unspecified",
]);

const fail = (message) => {
	throw new errs.ValidationError(message);
};

const requireString = (value, label, maxLength = 2048) => {
	if (typeof value !== "string" || value.length > maxLength) {
		fail(`${label} must be a string of at most ${maxLength} characters`);
	}
	if (CONTROL_OR_SPACE.test(value)) {
		fail(`${label} must not contain whitespace or control characters`);
	}
	return value;
};

const requireAdmin = async (access, label) => {
	// Internal callers and legacy tests do not always expose a full Access
	// instance. Production access objects always provide isAdmin().
	if (typeof access?.isAdmin === "function" && !(await access.isAdmin())) {
		fail(`${label} requires administrator privileges`);
	}
};

/** Strip a single trailing dot so `example.com.` is treated like `example.com`. */
const trimHostname = (value) => (value.endsWith(".") ? value.slice(0, -1) : value);

const ipRange = (value) => {
	const parsed = ipaddr.parse(value);
	if (parsed.kind() === "ipv6" && /** @type {any} */ (parsed).isIPv4MappedAddress()) {
		return /** @type {any} */ (parsed).toIPv4Address().range();
	}
	return parsed.range();
};

const isPrivateAddress = (value) => PRIVATE_RANGES.has(ipRange(value));

const isInternalName = (value) => {
	const host = value.toLowerCase();
	return (
		host === "localhost" ||
		host.endsWith(".localhost") ||
		host.endsWith(".local") ||
		host.endsWith(".internal") ||
		host.endsWith(".home.arpa") ||
		host === "metadata.google.internal"
	);
};

/**
 * Validate an upstream host. `allowPrivate` is true only for administrators:
 * delegated users may only point at public upstreams, never at loopback,
 * link-local/metadata, private networks, or the manager's own sockets.
 */
export const validateUpstreamHost = (value, { allowPrivate = false, label = "forward_host" } = {}) => {
	requireString(value, label, 253);
	if (value.startsWith("unix:")) {
		if (!allowPrivate) {
			fail(`${label} must not use a unix socket for delegated users`);
		}
		if (!/^unix:\/[A-Za-z0-9._/-]+:$/u.test(value) || value.includes("..")) {
			fail(`${label} contains an invalid unix socket path`);
		}
		return value;
	}
	let bare = value;
	if (bare.startsWith("[") && bare.endsWith("]")) {
		bare = bare.slice(1, -1);
		if (net.isIP(bare) !== 6) fail(`${label} must contain a valid IPv6 address inside brackets`);
	} else if (net.isIP(bare) === 6) {
		// A bare IPv6 literal is valid.
	} else if (bare.includes("://") || bare.includes("/") || bare.includes(":")) {
		fail(`${label} must be a hostname or IP address without a scheme, path or port`);
	}
	bare = trimHostname(bare);
	if (net.isIP(bare)) {
		if (bare === "0.0.0.0" || bare === "::") fail(`${label} must not be the unspecified address`);
		if (!allowPrivate && isPrivateAddress(bare)) {
			fail(`${label} must not point at a loopback, link-local, private or metadata address`);
		}
		return bare;
	}
	const lower = bare.toLowerCase();
	if (lower === "localhost" || lower.endsWith(".localhost")) {
		fail(`${label} must not point at localhost`);
	}
	if (!allowPrivate) {
		if (isInternalName(lower)) fail(`${label} must not point at an internal name`);
		if (!PUBLIC_FQDN.test(lower)) {
			fail(`${label} must be a public fully-qualified hostname for delegated users`);
		}
		return lower;
	}
	if (!SINGLE_LABEL.test(lower) && !PUBLIC_FQDN.test(lower)) {
		fail(`${label} is not a valid hostname or IP address`);
	}
	return lower;
};

/** Validate a filesystem root used by `forward_scheme: "path"`. */
export const validateWebRoot = (value, { allowPrivate = false } = {}) => {
	requireString(value, "forward_host", 4096);
	if (!value.startsWith("/")) fail("forward_host must be an absolute path in path mode");
	if (value.split("/").includes("..")) fail("forward_host must not contain '..' segments");
	if (NGINX_META.test(value) || LUA_META.test(value)) {
		fail("forward_host contains characters that are not allowed in an Nginx root");
	}
	const normalized = path.posix.normalize(value);
	if (normalized !== value && normalized !== `${value}/`) {
		fail("forward_host must be a normalized absolute path");
	}
	if (!allowPrivate) {
		const base = "/data/websites";
		if (normalized !== base && !normalized.startsWith(`${base}/`)) {
			fail(`forward_host must be below ${base}/ for delegated users`);
		}
	}
	return normalized;
};

/** Validate a literal Nginx location path (no regex or modifier). */
export const validateLocationPath = (value) => {
	requireString(value, "location path", 1024);
	if (!LOCATION_PATH.test(value)) {
		fail("location path must be a literal path beginning with '/' without regex or Nginx syntax");
	}
	if (value.split("/").includes("..")) fail("location path must not contain '..' segments");
	return value;
};

/** Validate a query string appended via `set $args`. */
export const validateForwardQuery = (value) => {
	if (value === null || value === undefined || value === "") return value;
	requireString(value, "forward_query", 4096);
	if (LUA_META.test(value) || !QUERY_VALUE.test(value)) {
		fail("forward_query contains characters that are not allowed in an Nginx query string");
	}
	return value;
};

/** Validate the `index` directive value. */
export const validateIndexFile = (value) => {
	if (value === null || value === undefined || value === "") return value;
	requireString(value, "index_file", 255);
	if (LUA_META.test(value) || !INDEX_FILE.test(value)) {
		fail("index_file must be a relative file path without '..' or Nginx syntax");
	}
	return value;
};

/** Validate a bandwidth value accepted by the Lua limiter. */
export const validateBandwidthLimit = (value) => {
	if (value === null || value === undefined || value === "") return value;
	if (typeof value !== "string" || !BANDWIDTH_LIMIT.test(value)) {
		fail("bandwidth_limit must be a number followed by an optional k or m suffix");
	}
	return value;
};

/** Advanced Nginx configuration is an administrator-only expert feature. */
export const validateAdvancedConfig = async (access, value, label = "advanced_config") => {
	if (value === null || value === undefined || value === "") return value;
	if (typeof value !== "string") fail(`${label} must be a string`);
	if (value.length > 64 * 1024) fail(`${label} is too large`);
	await requireAdmin(access, label);
	return value;
};

/**
 * Validate proxy-host fields before any write. Only fields present in `data`
 * are validated, except for cross-field checks that need the merged result.
 */
export const validateProxyHostFields = async (access, data = {}, existing = {}) => {
	const allowPrivate = typeof access?.isAdmin !== "function" || (await access.isAdmin());
	const merged = /** @type {any} */ ({ ...existing, ...data });

	if (Object.hasOwn(data, "advanced_config")) {
		await validateAdvancedConfig(access, data.advanced_config);
	}
	if (Object.hasOwn(data, "bandwidth_limit")) validateBandwidthLimit(data.bandwidth_limit);
	if (Object.hasOwn(data, "forward_query")) validateForwardQuery(data.forward_query);
	if (Object.hasOwn(data, "index_file")) validateIndexFile(data.index_file);
	if (Object.hasOwn(data, "forward_path") && data.forward_path) {
		requireString(data.forward_path, "forward_path", 4096);
		if (LUA_META.test(data.forward_path) || NGINX_META.test(data.forward_path)) {
			fail("forward_path contains characters that are not allowed");
		}
	}

	if (Object.hasOwn(data, "locations") && data.locations !== undefined) {
		if (!Array.isArray(data.locations)) fail("locations must be an array");
		for (const [index, location] of data.locations.entries()) {
			if (!location || typeof location !== "object") fail(`locations[${index}] must be an object`);
			if (location.path !== undefined) validateLocationPath(location.path);
			if (location.forward_query !== undefined) validateForwardQuery(location.forward_query);
			if (location.forward_host !== undefined) {
				if (location.forward_scheme === "path") {
					await requireAdmin(access, "path forwarding");
					validateWebRoot(location.forward_host, { allowPrivate });
				} else {
					validateUpstreamHost(location.forward_host, {
						allowPrivate,
						label: `locations[${index}].forward_host`,
					});
				}
			}
			if (location.advanced_config !== undefined) {
				await validateAdvancedConfig(access, location.advanced_config, `locations[${index}].advanced_config`);
			}
		}
	}

	const touchesRouting =
		Object.hasOwn(data, "forward_scheme") ||
		Object.hasOwn(data, "forward_host") ||
		Object.hasOwn(data, "certificate_id") ||
		Object.hasOwn(data, "ssl_forced");
	if (!touchesRouting) return;

	const scheme = merged.forward_scheme;
	const host = merged.forward_host;
	if (!scheme || host === undefined || host === null || host === "") return;

	if (scheme === "path") {
		await requireAdmin(access, "path forwarding");
		validateWebRoot(host, { allowPrivate });
	} else if (scheme === "http" || scheme === "https" || scheme === "grpc" || scheme === "grpcs") {
		if (host.startsWith("/")) fail("forward_host must be a hostname or IP address for this scheme");
		validateUpstreamHost(host, { allowPrivate });
	} else if (scheme === "terminal") {
		validateUpstreamHost(host, { allowPrivate });
		if (!merged.ssl_forced || (!merged.certificate_id && merged.certificate_id !== "new")) {
			fail("terminal hosts must use TLS (ssl_forced) with a certificate");
		}
	}
};

/** Validate redirection-host fields before a write. */
export const validateRedirectionHostFields = async (access, data = {}) => {
	if (Object.hasOwn(data, "advanced_config")) await validateAdvancedConfig(access, data.advanced_config);
	if (data.forward_domain_name !== undefined) {
		const name = requireString(data.forward_domain_name, "forward_domain_name", 253);
		if (name.startsWith("unix:")) {
			fail("forward_domain_name must not use a unix socket");
		}
		if (name.includes("://") || name.includes("/") || (name.includes(":") && net.isIP(name) !== 6)) {
			fail("forward_domain_name must be a hostname or IP address without a scheme or path");
		}
		validateUpstreamHost(name, { allowPrivate: true, label: "forward_domain_name" });
	}
};

/** Validate dead-host fields before a write. */
export const validateDeadHostFields = async (access, data = {}) => {
	if (Object.hasOwn(data, "advanced_config")) await validateAdvancedConfig(access, data.advanced_config);
};

/** Validate stream-host fields before a write. */
export const validateStreamHostFields = async (access, data = {}) => {
	const allowPrivate = typeof access?.isAdmin !== "function" || (await access.isAdmin());
	if (data.forwarding_host !== undefined) {
		validateUpstreamHost(data.forwarding_host, { allowPrivate, label: "forwarding_host" });
	}
	if (data.forwarding_port !== undefined && data.forwarding_port !== null && data.forwarding_port !== "") {
		const port = Number(data.forwarding_port);
		if (!Number.isInteger(port) || port < 1 || port > 65535)
			fail("forwarding_port must be an integer between 1 and 65535");
	}
	if (Object.hasOwn(data, "advanced_config")) await validateAdvancedConfig(access, data.advanced_config);
};

export default {
	validateAdvancedConfig,
	validateBandwidthLimit,
	validateDeadHostFields,
	validateForwardQuery,
	validateIndexFile,
	validateLocationPath,
	validateProxyHostFields,
	validateRedirectionHostFields,
	validateStreamHostFields,
	validateUpstreamHost,
	validateWebRoot,
};
