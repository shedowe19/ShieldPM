import { isIP } from "node:net";
import errs from "./error.js";

const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const metadata = (value) => {
	let result = value;
	for (let depth = 0; depth < 2 && typeof result === "string"; depth++) {
		try {
			result = JSON.parse(result);
		} catch {
			return {};
		}
	}
	return object(result) ? result : {};
};
const integer = (value, fallback, minimum, maximum, field) => {
	const result = value === undefined ? fallback : value;
	if (!Number.isInteger(result) || result < minimum || result > maximum) {
		throw new errs.ValidationError(`${field} must be an integer between ${minimum} and ${maximum}`);
	}
	return result;
};
const flag = (value, fallback, field) => {
	if (value !== undefined && typeof value !== "boolean") throw new errs.ValidationError(`${field} must be a boolean`);
	return value ?? fallback;
};
const hostname = (value, field) => {
	if (typeof value !== "string") throw new errs.ValidationError(`${field} must be a hostname or IP address`);
	const normalized = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
	if (isIP(normalized)) return normalized;
	if (
		normalized.length > 253 ||
		!/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(normalized) ||
		normalized.split(".").some((part) => !part || part.length > 63 || part.startsWith("-") || part.endsWith("-"))
	) {
		throw new errs.ValidationError(`${field} must be a hostname or IP address without a URL or path`);
	}
	return normalized.toLowerCase();
};
const keys = (value, allowed, field) => {
	if (!object(value) || Object.keys(value).some((key) => !allowed.includes(key))) {
		throw new errs.ValidationError(`Invalid ${field} settings`);
	}
};
const supported = (host, label) => {
	if (!["http", "https"].includes(host.forward_scheme))
		throw new errs.ValidationError(`${label} requires an HTTP or HTTPS proxy host`);
};

/** Validate bounded structured pool settings; never accept Nginx source text. */
export function normalizeUpstreamPool(value, host) {
	if (value === undefined || value === null) return null;
	keys(
		value,
		["enabled", "targets", "connect_timeout", "read_timeout", "host_header", "tls_server_name", "tls_verify"],
		"upstream pool",
	);
	const enabled = flag(value.enabled, false, "Pool enabled");
	const result = {
		enabled,
		targets: [],
		connect_timeout: integer(value.connect_timeout, 5, 1, 60, "Connect timeout"),
		read_timeout: integer(value.read_timeout, 60, 1, 600, "Read timeout"),
		tls_verify: flag(value.tls_verify, true, "TLS verification"),
	};
	if (value.host_header) result.host_header = hostname(value.host_header, "Host header");
	if (value.tls_server_name) result.tls_server_name = hostname(value.tls_server_name, "TLS server name");
	if (value.targets !== undefined && !Array.isArray(value.targets))
		throw new errs.ValidationError("Pool targets must be an array");
	if ((value.targets || []).length > 16)
		throw new errs.ValidationError("An upstream pool supports at most 16 targets");
	const ids = new Set();
	const addresses = new Set();
	for (const target of value.targets || []) {
		keys(
			target,
			["id", "label", "host", "port", "weight", "backup", "max_fails", "fail_timeout"],
			"upstream target",
		);
		if (typeof target.id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(target.id) || ids.has(target.id))
			throw new errs.ValidationError(
				"Pool target IDs must be unique and contain only letters, digits, underscores or hyphens",
			);
		ids.add(target.id);
		if (target.label !== undefined && (typeof target.label !== "string" || target.label.length > 80))
			throw new errs.ValidationError("Pool target label must be at most 80 characters");
		const item = {
			id: target.id,
			label: target.label || target.id,
			host: hostname(target.host, "Upstream host"),
			port: integer(target.port, 80, 1, 65535, "Upstream port"),
			weight: integer(target.weight, 1, 1, 1000, "Upstream weight"),
			backup: flag(target.backup, false, "Backup target"),
			max_fails: integer(target.max_fails, 1, 1, 10, "Failure threshold"),
			fail_timeout: integer(target.fail_timeout, 10, 1, 300, "Failure timeout"),
		};
		const address = `${item.host}:${item.port}`;
		if (addresses.has(address)) throw new errs.ValidationError("Pool targets must use distinct addresses");
		addresses.add(address);
		result.targets.push(item);
	}
	if (enabled) {
		supported(host, "Upstream pools");
		if (!result.targets.some((target) => !target.backup))
			throw new errs.ValidationError("An enabled pool needs at least one primary target");
		if (host.forward_host?.includes("/") || host.advanced_config?.trim())
			throw new errs.ValidationError(
				"Upstream pools require an origin without a path and no custom advanced Nginx configuration",
			);
	}
	return result;
}

/** Normalize per-route cache TTLs, including the legacy Cache Assets switch. */
export function normalizeCachePolicy(value, host) {
	if (value === null) return null;
	if (value === undefined && !host.caching_enabled) return null;
	const source = value ?? { enabled: ["http", "https"].includes(host.forward_scheme), assets_only: true };
	keys(
		source,
		["enabled", "ttl_seconds", "max_size_mb", "inactive_seconds", "assets_only", "cache_key", "routes"],
		"cache policy",
	);
	const result = {
		enabled: flag(source.enabled, false, "Cache enabled"),
		ttl_seconds: integer(source.ttl_seconds, 3600, 1, 86400, "Cache TTL"),
		max_size_mb: integer(source.max_size_mb, 256, 16, 10240, "Cache size"),
		inactive_seconds: integer(source.inactive_seconds, 86400, 60, 604800, "Cache inactivity"),
		assets_only: flag(source.assets_only, true, "Assets only"),
		cache_key: source.cache_key ?? "uri",
		routes: [],
	};
	if (!["uri", "uri_ignore_query"].includes(result.cache_key))
		throw new errs.ValidationError("Invalid cache key mode");
	if (result.cache_key === "uri_ignore_query" && !result.assets_only)
		throw new errs.ValidationError("Ignoring query parameters requires static-assets-only caching");
	const routes = source.routes ?? [{ path: "/", ttl_seconds: result.ttl_seconds }];
	if (!Array.isArray(routes) || routes.length < 1 || routes.length > 16)
		throw new errs.ValidationError("Cache needs between 1 and 16 routes");
	const paths = new Set();
	for (const route of routes) {
		keys(route, ["path", "ttl_seconds"], "cache route");
		if (
			typeof route.path !== "string" ||
			route.path.length > 256 ||
			!/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(route.path) ||
			route.path.split("/").some((part) => part === "." || part === "..") ||
			route.path.startsWith("/.well-known/") ||
			route.path.startsWith("/remote.php/") ||
			paths.has(route.path)
		)
			throw new errs.ValidationError("Cache route prefixes must be unique absolute directory paths");
		paths.add(route.path);
		result.routes.push({
			path: route.path,
			ttl_seconds: integer(route.ttl_seconds, result.ttl_seconds, 1, 86400, "Route TTL"),
		});
	}
	if (result.enabled) {
		supported(host, "Response caching");
		if (value !== undefined && host.advanced_config?.trim())
			throw new errs.ValidationError("Managed caching requires no custom advanced Nginx configuration");
	}
	return result;
}

/** Preserve unrelated metadata during partial writes and validate all managed traffic settings. */
export function validateHostTrafficPolicy(data, previous = {}) {
	const meta = { ...metadata(previous.meta), ...metadata(data.meta) };
	const host = { ...previous, ...data, meta };
	if (meta.waf_ruleset === undefined)
		meta.waf_ruleset = previous.id ? (previous.caching_enabled ? "crs" : "base") : "crs";
	if (!["base", "crs"].includes(meta.waf_ruleset)) throw new errs.ValidationError("Invalid WAF ruleset");
	if (meta.upstream_pool !== undefined) meta.upstream_pool = normalizeUpstreamPool(meta.upstream_pool, host);
	if (meta.cache_policy !== undefined) meta.cache_policy = normalizeCachePolicy(meta.cache_policy, host);
	// Also validate the legacy flag without silently changing unrelated metadata.
	if (host.caching_enabled && meta.cache_policy === undefined) {
		const legacyCache = normalizeCachePolicy(undefined, host);
		if (!legacyCache?.enabled) meta.cache_policy = legacyCache;
	}
	data.meta = meta;
	return data;
}
