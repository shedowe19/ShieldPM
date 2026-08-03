import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { URL } from "node:url";
import ipaddr from "ipaddr.js";
import errs from "../lib/error.js";
import { global as logger } from "../logger.js";
import FirewallPolicy from "../models/firewall_policy.js";
import ProxyHost from "../models/proxy_host.js";
import internalAuditLog from "./audit-log.js";
import internalGitOps from "./gitops.js";
import internalNginx from "./nginx.js";

const FIREWALL_DIR = process.env.FIREWALL_DATA_DIR || "/data/nginx/firewall";
const FIREWALL_CONFIG_PATH = process.env.FIREWALL_CONFIG_PATH || "/data/nginx/firewall.conf";
const REFRESH_CHECK_MS = 60 * 60 * 1000;
const MAX_FEEDS = 8;
const MAX_CIDRS = 10000;
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const FEED_TIMEOUT_MS = 20000;

let refreshTimer;

const unique = (values) => [...new Set(values)];
const isGeoIpEnabled = () => process.env.NGINX_LOAD_GEOIP2_MODULE === "true";

const normaliseCidr = (value) => {
	const raw = String(value || "").trim();
	if (!raw) throw new Error("CIDR must not be empty");
	const [address, prefix] = raw.includes("/")
		? ipaddr.parseCIDR(raw)
		: [ipaddr.parse(raw), ipaddr.parse(raw).kind() === "ipv4" ? 32 : 128];
	return `${address.toString()}/${prefix}`;
};

const parseCidrList = (text) => {
	const cidrs = [];
	const invalid = [];
	for (const line of String(text || "").split(/\r?\n/)) {
		const value = line.replace(/#.*/, "").trim().split(/\s+/)[0];
		if (!value) continue;
		try {
			cidrs.push(normaliseCidr(value));
		} catch {
			invalid.push(value);
		}
	}
	return { cidrs: unique(cidrs), invalid };
};

const normaliseCidrValues = (values, field) => {
	if (!Array.isArray(values) || values.length > MAX_CIDRS) {
		throw new errs.ValidationError(`${field} must contain at most ${MAX_CIDRS} CIDRs.`);
	}
	try {
		return unique(values.map(normaliseCidr));
	} catch {
		throw new errs.ValidationError(`${field} contains an invalid IPv4 or IPv6 CIDR.`);
	}
};

const validateFeedUrl = (value) => {
	let url;
	try {
		url = new URL(String(value));
	} catch {
		throw new errs.ValidationError("Feed URLs must be valid HTTPS URLs.");
	}
	if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
		throw new errs.ValidationError("Feed URLs must use HTTPS without credentials or a custom port.");
	}
	return url.toString();
};

const normaliseFeedUrls = (values) => {
	if (!Array.isArray(values) || values.length > MAX_FEEDS) {
		throw new errs.ValidationError(`feed_urls must contain at most ${MAX_FEEDS} HTTPS URLs.`);
	}
	return unique(values.map(validateFeedUrl));
};

const isPublicAddress = (address) => {
	try {
		const parsed = ipaddr.parse(address);
		if (parsed.kind() === "ipv6" && parsed.isIPv4MappedAddress()) {
			return parsed.toIPv4Address().range() === "unicast";
		}
		return parsed.range() === "unicast";
	} catch {
		return false;
	}
};

const resolveFeedEndpoint = async (url) => {
	if (ipaddr.isValid(url.hostname)) {
		if (!isPublicAddress(url.hostname)) throw new errs.ValidationError("Feed URL must not target a private address.");
		return [{ address: url.hostname, family: url.hostname.includes(":") ? 6 : 4 }];
	}
	const addresses = await dnsLookup(url.hostname, { all: true, verbatim: true });
	if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
		throw new errs.ValidationError("Feed URL must resolve exclusively to public addresses.");
	}
	return addresses;
};

const createPinnedLookup = (addresses) => (_hostname, options, callback) => {
	if (options?.all) {
		callback(null, addresses);
		return;
	}
	const selected = addresses[0];
	callback(null, selected.address, selected.family);
};

const fetchFeed = async (rawUrl, state = {}) => {
	const url = new URL(validateFeedUrl(rawUrl));
	const addresses = await resolveFeedEndpoint(url);
	return await new Promise((resolve, reject) => {
		const request = https.request(
			{
				protocol: "https:",
				host: url.hostname,
				port: url.port || 443,
				path: `${url.pathname}${url.search}`,
				method: "GET",
				servername: url.hostname,
				headers: {
					Accept: "text/plain, text/*;q=0.9, */*;q=0.1",
					Host: url.host,
					...(state.etag ? { "If-None-Match": state.etag } : {}),
					...(state.lastModified ? { "If-Modified-Since": state.lastModified } : {}),
				},
				lookup: createPinnedLookup(addresses),
			},
			(response) => {
				const etag = response.headers.etag || null;
				const lastModified = response.headers["last-modified"] || null;
				if (response.statusCode === 304) {
					response.resume();
					resolve({ notModified: true, etag, lastModified });
					return;
				}
				if (response.statusCode !== 200) {
					response.resume();
					reject(new Error(`Feed returned HTTP ${response.statusCode}. Redirects are not followed.`));
					return;
				}
				const chunks = [];
				let length = 0;
				response.on("data", (chunk) => {
					length += chunk.length;
					if (length > MAX_FEED_BYTES) {
						request.destroy(new Error("Feed exceeds the 5 MiB limit."));
						return;
					}
					chunks.push(chunk);
				});
				response.on("end", () => resolve({ body: Buffer.concat(chunks).toString("utf8"), etag, lastModified }));
			}
		);
		request.setTimeout(FEED_TIMEOUT_MS, () => request.destroy(new Error("Feed request timed out.")));
		request.on("error", reject);
		request.end();
	});
};

const atomicWrite = async (filename, content) => {
	await fs.mkdir(path.dirname(filename), { recursive: true });
	const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
	await fs.writeFile(temporary, content, "utf8");
	await fs.rename(temporary, filename);
};

const feedFile = (policyId, url) =>
	path.join(FIREWALL_DIR, String(policyId), `feed-${createHash("sha256").update(url).digest("hex")}.cidrs`);
const compiledCidrFile = (policyId) => path.join(FIREWALL_DIR, `policy-${policyId}.cidrs`);

const ensurePolicyFiles = async (policy) => {
	await fs.mkdir(path.join(FIREWALL_DIR, String(policy.id)), { recursive: true });
	await fs.writeFile(compiledCidrFile(policy.id), "", { encoding: "utf8", flag: "a" });
};

const readPolicyFeedCidrs = async (policy) => {
	const values = new Set();
	for (const url of policy.feed_urls || []) {
		try {
			const { cidrs } = parseCidrList(await fs.readFile(feedFile(policy.id, url), "utf8"));
			for (const cidr of cidrs) values.add(cidr);
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
	return values;
};

const renderNginxConfig = (policies, geoIpAvailable = isGeoIpEnabled()) => {
	const lines = [
		"# Managed by ShieldPM. Do not edit manually.",
		"# Per-policy CIDR data lives in /data/nginx/firewall/.",
		geoIpAvailable ? "map $geoip2_country_code $shieldpm_geoip_country_code {" : "map \"\" $shieldpm_geoip_country_code {",
		geoIpAvailable ? "    default $geoip2_country_code;" : '    default "";',
		"}",
		"",
	];
	for (const policy of policies) {
		const id = Number(policy.id);
		const prefix = `$shieldpm_firewall_${id}`;
		lines.push(`geo ${prefix}_allow {`, "    default 0;");
		for (const cidr of policy.allow_cidrs || []) lines.push(`    ${cidr} 1;`);
		lines.push("}", "", `geo ${prefix}_cidr_block {`, "    default 0;");
		for (const cidr of policy.block_cidrs || []) lines.push(`    ${cidr} 1;`);
		lines.push(`    include ${compiledCidrFile(id)};`, "}", "");
		lines.push(`map ${prefix === "$shieldpm_firewall_0" ? '""' : "$shieldpm_geoip_country_code"} ${prefix}_geo_block {`);
		if (!geoIpAvailable || policy.geo_mode === "off") {
			lines.push("    default 0;");
		} else if (policy.geo_mode === "allow") {
			lines.push("    default 1;");
			for (const country of policy.geo_countries || []) lines.push(`    ${country} 0;`);
		} else {
			lines.push("    default 0;");
			for (const country of policy.geo_countries || []) lines.push(`    ${country} 1;`);
		}
		lines.push("}", "");
		const firewallState = `\"${prefix}_allow:${prefix}_cidr_block:${prefix}_geo_block\"`;
		lines.push(`map ${firewallState} ${prefix}_blocked {`);
		lines.push("    default 0;", '    "~^1:" 0;', '    "~^0:1:" 1;', '    "~^0:0:1$" 1;', "}", "");
		lines.push(`map ${firewallState} ${prefix}_block_reason {`);
		lines.push('    default "ip";', '    "~^1:" "none";', '    "~^0:1:" "ip";', '    "~^0:0:1$" "country";', "}", "");
	}
	return `${lines.join("\n")}\n`;
};

const writeFirewallConfig = async () => {
	const policies = await FirewallPolicy.query().orderBy("id", "ASC");
	for (const policy of policies) await ensurePolicyFiles(policy);
	await atomicWrite(FIREWALL_CONFIG_PATH, renderNginxConfig(policies));
	return policies;
};

const mergePolicyPayload = (input, existing = null) => {
	const data = {};
	if (typeof input.name !== "undefined") {
		if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 255) {
			throw new errs.ValidationError("Policy name must contain 1 to 255 characters.");
		}
		data.name = input.name.trim();
	}
	if (!existing && !data.name) throw new errs.ValidationError("Policy name is required.");
	if (typeof input.enabled !== "undefined") data.enabled = Boolean(input.enabled);
	if (typeof input.action !== "undefined") {
		if (!["deny", "drop"].includes(input.action)) throw new errs.ValidationError("action must be deny or drop.");
		data.action = input.action;
	}
	if (typeof input.geo_mode !== "undefined") {
		if (!["off", "allow", "block"].includes(input.geo_mode)) throw new errs.ValidationError("geo_mode must be off, allow, or block.");
		data.geo_mode = input.geo_mode;
	}
	if (typeof input.geo_countries !== "undefined") {
		if (!Array.isArray(input.geo_countries) || input.geo_countries.length > 250) {
			throw new errs.ValidationError("geo_countries must contain at most 250 country codes.");
		}
		data.geo_countries = unique(input.geo_countries.map((country) => String(country).trim().toUpperCase()));
		if (data.geo_countries.some((country) => !/^[A-Z]{2}$/.test(country))) {
			throw new errs.ValidationError("geo_countries must use ISO 3166-1 alpha-2 country codes.");
		}
	}
	if (typeof input.allow_cidrs !== "undefined") data.allow_cidrs = normaliseCidrValues(input.allow_cidrs, "allow_cidrs");
	if (typeof input.block_cidrs !== "undefined") data.block_cidrs = normaliseCidrValues(input.block_cidrs, "block_cidrs");
	if (typeof input.feed_urls !== "undefined") data.feed_urls = normaliseFeedUrls(input.feed_urls);
	if (typeof input.refresh_interval_hours !== "undefined") {
		const hours = Number(input.refresh_interval_hours);
		if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
			throw new errs.ValidationError("refresh_interval_hours must be an integer from 1 to 168.");
		}
		data.refresh_interval_hours = hours;
	}
	if (!existing) {
		return {
			enabled: true,
			action: "deny",
			geo_mode: "off",
			geo_countries: [],
			allow_cidrs: [],
			block_cidrs: [],
			feed_urls: [],
			refresh_interval_hours: 24,
			feed_status: {},
			...data,
		};
	}
	return data;
};

const getLinkedHosts = async (policyId) =>
	await ProxyHost.query()
		.where("is_deleted", 0)
		.where("firewall_policy_id", policyId)
		.withGraphFetched("[certificate,access_list.[clients,items],host_domains,firewall_policy]");

const regenerateLinkedHosts = async (policyId) => {
	const hosts = await getLinkedHosts(policyId);
	if (hosts.length) await internalNginx.bulkGenerateConfigs(ProxyHost, "proxy_host", hosts);
};

const refreshPolicy = async (policy, { regenerate = true } = {}) => {
	await ensurePolicyFiles(policy);
	const status = { ...(policy.feed_status || {}) };
	const errors = [];
	for (const url of policy.feed_urls || []) {
		try {
			const result = await fetchFeed(url, status[url]);
			if (!result.notModified) {
				const parsed = parseCidrList(result.body);
				if (parsed.invalid.length) logger.warn(`Firewall policy ${policy.id} ignored ${parsed.invalid.length} invalid CIDRs from ${url}`);
				if (result.body.trim() && !parsed.cidrs.length) {
					throw new Error("Feed did not contain a valid IPv4 or IPv6 CIDR.");
				}
				await atomicWrite(feedFile(policy.id, url), `${parsed.cidrs.map((cidr) => `${cidr} 1;`).join("\n")}\n`);
				status[url] = { count: parsed.cidrs.length, etag: result.etag, lastModified: result.lastModified, lastSuccess: new Date().toISOString() };
			} else {
				status[url] = { ...status[url], etag: result.etag || status[url]?.etag, lastModified: result.lastModified || status[url]?.lastModified };
			}
			delete status[url].error;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			status[url] = { ...status[url], error: message };
			errors.push(`${url}: ${message}`);
		}
	}
	const feedCidrs = await readPolicyFeedCidrs(policy);
	await atomicWrite(compiledCidrFile(policy.id), `${[...feedCidrs].map((cidr) => `${cidr} 1;`).join("\n")}\n`);
	const activeCidrs = new Set([...(policy.block_cidrs || []), ...feedCidrs]);
	const update = {
		feed_status: status,
		total_cidrs: activeCidrs.size,
		last_error: errors.length ? errors.join(" ") : null,
		...(errors.length < (policy.feed_urls || []).length ? { last_updated_on: new Date().toISOString() } : {}),
	};
	const result = await FirewallPolicy.query().patchAndFetchById(policy.id, update);
	if (regenerate) {
		await writeFirewallConfig();
		await internalNginx.reload();
	}
	return result;
};

const synchronizePolicy = async (policy, refresh = true) => {
	await ensurePolicyFiles(policy);
	const updated = refresh ? await refreshPolicy(policy, { regenerate: false }) : policy;
	await writeFirewallConfig();
	await regenerateLinkedHosts(policy.id);
	await internalNginx.reload();
	return updated;
};

const internalFirewallPolicy = {
	create: async (access, data) => {
		await access.can("settings:update", "firewall-policies");
		const policy = await FirewallPolicy.query().insertAndFetch(mergePolicyPayload(data));
		const result = await synchronizePolicy(policy);
		await internalAuditLog.add(access, { action: "created", object_type: "firewall-policy", object_id: policy.id, meta: result });
		internalGitOps.triggerAutoPush("firewall-policy");
		return result;
	},

	get: async (access, id) => {
		await access.can("settings:update", "firewall-policies");
		const policy = await FirewallPolicy.query().findById(id);
		if (!policy) throw new errs.ItemNotFoundError(id);
		return policy;
	},

	getAll: async (access) => {
		await access.can("settings:update", "firewall-policies");
		return await FirewallPolicy.query().orderBy("name", "ASC");
	},

	update: async (access, id, data) => {
		const existing = await internalFirewallPolicy.get(access, id);
		const policy = await FirewallPolicy.query().patchAndFetchById(id, mergePolicyPayload(data, existing));
		const result = await synchronizePolicy(policy);
		await internalAuditLog.add(access, { action: "updated", object_type: "firewall-policy", object_id: id, meta: result });
		internalGitOps.triggerAutoPush("firewall-policy");
		return result;
	},

	refresh: async (access, id) => {
		const policy = await internalFirewallPolicy.get(access, id);
		const result = await synchronizePolicy(policy);
		await internalAuditLog.add(access, { action: "updated", object_type: "firewall-policy", object_id: id, meta: { refresh: true } });
		return result;
	},

	delete: async (access, id) => {
		const policy = await internalFirewallPolicy.get(access, id);
		const hostIds = (await getLinkedHosts(id)).map((host) => host.id);
		await ProxyHost.query().whereIn("id", hostIds).patch({ firewall_policy_id: null });
		await FirewallPolicy.query().deleteById(id);
		await fs.rm(path.join(FIREWALL_DIR, String(id)), { recursive: true, force: true });
		await fs.rm(compiledCidrFile(id), { force: true });
		await writeFirewallConfig();
		const hosts = hostIds.length
			? await ProxyHost.query().whereIn("id", hostIds).withGraphFetched("[certificate,access_list.[clients,items],host_domains,firewall_policy]")
			: [];
		if (hosts.length) await internalNginx.bulkGenerateConfigs(ProxyHost, "proxy_host", hosts);
		await internalNginx.reload();
		await internalAuditLog.add(access, { action: "deleted", object_type: "firewall-policy", object_id: id, meta: { name: policy.name } });
		internalGitOps.triggerAutoPush("firewall-policy");
		return true;
	},

	init: async () => {
		await writeFirewallConfig();
		await internalFirewallPolicy.refreshDuePolicies(false);
		if (!refreshTimer) {
			refreshTimer = setInterval(() => void internalFirewallPolicy.refreshDuePolicies(true), REFRESH_CHECK_MS);
			refreshTimer.unref?.();
		}
	},

	refreshDuePolicies: async (reload) => {
		const policies = await FirewallPolicy.query().where("enabled", 1);
		let changed = false;
		for (const policy of policies) {
			const last = policy.last_updated_on ? new Date(policy.last_updated_on).getTime() : 0;
			if (last && Date.now() - last < policy.refresh_interval_hours * REFRESH_CHECK_MS) continue;
			try {
				await refreshPolicy(policy, { regenerate: false });
				changed = true;
			} catch (error) {
				logger.error(`Firewall policy ${policy.id} refresh failed:`, error);
			}
		}
		if (changed) {
			await writeFirewallConfig();
			if (reload) await internalNginx.reload();
		}
	},
};

export { createPinnedLookup, fetchFeed, normaliseCidr, parseCidrList, renderNginxConfig, validateFeedUrl };
export default internalFirewallPolicy;
