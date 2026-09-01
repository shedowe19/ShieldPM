import { lookup } from "node:dns/promises";
import https from "node:https";
import dayjs from "dayjs";
import ipaddr from "ipaddr.js";
import errs from "../lib/error.js";
import { global as logger } from "../logger.js";
import DdnsProvider from "../models/ddns_provider.js";

let timer = null;
let startupTimer = null;
let processPromise = null;
let pendingForce = false;
const INTERVAL = 1000 * 60;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_REDIRECTS = 3;
const MAX_CUSTOM_URL_BYTES = 4096;
const MAX_ERROR_LENGTH = 500;
const ALLOWED_CUSTOM_PLACEHOLDERS = new Set(["IP", "IPv4", "IPv6", "DOMAIN"]);

const configurationError = (message, previous) => new errs.ConfigurationError(message, previous);

/**
 * Remove credentials and URL query strings before an external error is logged or persisted.
 * @param {unknown} error
 * @param {Object} [provider]
 * @returns {string}
 */
const redactError = (error, provider) => {
	let message = error instanceof Error ? error.message : String(error);
	message = message
		.replace(/https?:\/\/[^\s"']+/giu, "[redacted-url]")
		.replace(/Bearer\s+[^\s,;]+/giu, "Bearer [redacted]")
		.replace(/(authorization|token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/giu, "$1=[redacted]");

	for (const [key, value] of Object.entries(provider?.config || {})) {
		if (
			typeof value === "string" &&
			value.length > 0 &&
			(value.length >= 4 || /(authorization|token|password|secret|api[_-]?key)/iu.test(key))
		) {
			message = message.replaceAll(value, "[redacted]");
		}
	}

	return message.slice(0, MAX_ERROR_LENGTH);
};

/**
 * Only globally routable unicast addresses may be used by custom DDNS callbacks.
 * @param {string} address
 * @returns {void}
 */
const assertPublicAddress = (address) => {
	let parsed;
	try {
		parsed = ipaddr.parse(address);
	} catch (error) {
		throw configurationError("SSRF: Invalid IP address", error);
	}

	if (parsed.kind() === "ipv6" && parsed.isIPv4MappedAddress()) {
		parsed = parsed.toIPv4Address();
	}

	if (parsed.range() !== "unicast") {
		throw configurationError("SSRF: Private, local, reserved, and metadata addresses are not allowed");
	}
};

/** @param {string} hostname @returns {string} */
const normalizeHostname = (hostname) => hostname.replace(/^\[|\]$/g, "").replace(/\.+$/u, "");

/**
 * Validate immutable URL properties before DNS resolution.
 * @param {string|URL} urlValue
 * @returns {URL}
 */
const validatePublicUrl = (urlValue) => {
	let parsed;
	try {
		parsed = new URL(urlValue);
	} catch (error) {
		throw configurationError("Custom DDNS URL is invalid", error);
	}

	if (parsed.protocol !== "https:") {
		throw configurationError("SSRF: Only HTTPS custom callback URLs are allowed");
	}
	if (parsed.username || parsed.password) {
		throw configurationError("SSRF: URL user information is not allowed");
	}
	if (!parsed.hostname || parsed.href.length > MAX_CUSTOM_URL_BYTES) {
		throw configurationError("Custom DDNS URL exceeds the allowed size");
	}
	const normalizedHostname = normalizeHostname(parsed.hostname);
	if (normalizedHostname.toLowerCase() === "localhost" || normalizedHostname.toLowerCase().endsWith(".localhost")) {
		throw configurationError("SSRF: Localhost URLs are not allowed");
	}
	if (ipaddr.isValid(normalizedHostname)) {
		assertPublicAddress(normalizedHostname);
	}

	return parsed;
};

/**
 * Resolve every answer before connecting and pin the request to one validated address.
 * Rejecting a hostname when any answer is private avoids public/private DNS round-robin bypasses.
 * @param {URL} url
 * @returns {Promise<{address: string, family: number}>}
 */
const resolvePublicAddress = async (url) => {
	const normalizedHostname = normalizeHostname(url.hostname);
	if (ipaddr.isValid(normalizedHostname)) {
		assertPublicAddress(normalizedHostname);
		return { address: normalizedHostname, family: ipaddr.parse(normalizedHostname).kind() === "ipv6" ? 6 : 4 };
	}

	let answers;
	try {
		answers = await lookup(normalizedHostname, { all: true, verbatim: true });
	} catch (error) {
		throw configurationError("Custom DDNS hostname could not be resolved", error);
	}
	if (!answers.length) {
		throw configurationError("Custom DDNS hostname returned no addresses");
	}
	for (const answer of answers) {
		if (!answer || typeof answer.address !== "string") {
			throw configurationError("Custom DDNS hostname returned an invalid address");
		}
		assertPublicAddress(answer.address);
	}
	const firstAddress = answers[0].address;
	return {
		address: firstAddress,
		family: ipaddr.parse(firstAddress).kind() === "ipv6" ? 6 : 4,
	};
};

/**
 * Bound DNS resolution as well as the socket request to one end-to-end deadline.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} deadline
 * @returns {Promise<T>}
 */
const withDeadline = async (promise, deadline) => {
	const remaining = deadline - Date.now();
	if (remaining <= 0) throw configurationError("Custom DDNS request timed out");
	let timeout;
	try {
		return await Promise.race([
			promise,
			new Promise((_, reject) => {
				timeout = setTimeout(() => reject(configurationError("Custom DDNS request timed out")), remaining);
				timeout.unref?.();
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
};

/**
 * Perform a bounded HTTPS GET with DNS pinning and per-hop redirect validation.
 * @param {URL|string} urlValue
 * @param {number} [redirectCount]
 * @param {number} [deadline]
 * @returns {Promise<{status: number, body: string}>}
 */
const requestCustomUrl = async (urlValue, redirectCount = 0, deadline = Date.now() + REQUEST_TIMEOUT_MS) => {
	const url = validatePublicUrl(urlValue);
	const hostname = normalizeHostname(url.hostname);
	const pinned = await withDeadline(resolvePublicAddress(url), deadline);
	const remaining = deadline - Date.now();
	if (remaining <= 0) throw configurationError("Custom DDNS request timed out");

	return await new Promise((resolve, reject) => {
		let settled = false;
		let timeout;
		const cleanup = () => {
			if (timeout) clearTimeout(timeout);
		};
		const finishReject = (error) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(
				error instanceof errs.ConfigurationError
					? error
					: configurationError("Custom DDNS request failed", error),
			);
		};
		const finishResolve = (value) => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(value);
		};

		const request = https.request(
			{
				protocol: "https:",
				hostname,
				port: url.port || 443,
				path: `${url.pathname}${url.search}`,
				method: "GET",
				headers: {
					Accept: "text/plain, application/json;q=0.9, */*;q=0.1",
					Host: url.host,
					"User-Agent": "ShieldPM-DDNS/1",
				},
				servername: ipaddr.isValid(hostname) ? undefined : hostname,
				rejectUnauthorized: true,
				agent: false,
				lookup: (_hostname, options, callback) => {
					if (options?.all) {
						callback(null, [{ address: pinned.address, family: pinned.family }]);
						return;
					}
					callback(null, pinned.address, pinned.family);
				},
			},
			(response) => {
				response.on("error", finishReject);
				const status = response.statusCode || 0;
				if ([301, 302, 303, 307, 308].includes(status)) {
					cleanup();
					response.destroy();
					if (!response.headers.location) {
						finishReject(configurationError("Custom DDNS redirect has no Location header"));
						return;
					}
					if (redirectCount >= MAX_REDIRECTS) {
						finishReject(configurationError("Custom DDNS redirect limit exceeded"));
						return;
					}
					let redirectUrl;
					try {
						redirectUrl = new URL(response.headers.location, url);
					} catch (error) {
						finishReject(configurationError("Custom DDNS redirect URL is invalid", error));
						return;
					}
					void requestCustomUrl(redirectUrl, redirectCount + 1, deadline).then(finishResolve, finishReject);
					return;
				}
				const declaredLength = Number(response.headers["content-length"]);
				if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
					finishReject(configurationError("Custom DDNS response exceeds 256 KiB"));
					response.destroy();
					return;
				}

				let bytes = 0;
				const chunks = [];
				response.on("data", (chunk) => {
					bytes += chunk.length;
					if (bytes > MAX_RESPONSE_BYTES) {
						finishReject(configurationError("Custom DDNS response exceeds 256 KiB"));
						response.destroy();
						return;
					}
					chunks.push(chunk);
				});
				response.on("end", () => {
					finishResolve({ status, body: Buffer.concat(chunks).toString("utf8") });
				});
			},
		);

		timeout = setTimeout(() => {
			finishReject(configurationError("Custom DDNS request timed out"));
			request.destroy();
		}, remaining);
		timeout.unref?.();
		request.on("error", finishReject);
		request.end();
	});
};

/** @param {Response} response @returns {Promise<string>} */
const readBoundedResponse = async (response) => {
	const declaredLength = Number(response.headers?.get?.("content-length"));
	if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
		throw configurationError("External service response exceeds 256 KiB");
	}

	if (!response.body?.getReader) {
		const text = await response.text();
		if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
			throw configurationError("External service response exceeds 256 KiB");
		}
		return text;
	}

	const reader = response.body.getReader();
	const chunks = [];
	let bytes = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			const chunk = Buffer.from(value);
			bytes += chunk.length;
			if (bytes > MAX_RESPONSE_BYTES) {
				await reader.cancel();
				throw configurationError("External service response exceeds 256 KiB");
			}
			chunks.push(chunk);
		}
	} finally {
		reader.releaseLock();
	}
	return Buffer.concat(chunks).toString("utf8");
};

/**
 * Fetch a bounded response from a fixed, vendor-controlled endpoint.
 * @param {string|URL} url
 * @param {RequestInit} [options]
 * @returns {Promise<{response: Response, text: string}>}
 */
const fetchBounded = async (url, options = {}) => {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	timeout.unref?.();
	try {
		const response = await fetch(url, {
			...options,
			signal: controller.signal,
			redirect: "error",
			headers: { ...options.headers },
		});
		const text = await readBoundedResponse(response);
		return { response, text };
	} catch (error) {
		if (error instanceof errs.ConfigurationError) throw error;
		throw configurationError("External DDNS service request failed", error);
	} finally {
		clearTimeout(timeout);
	}
};

const fetchBoundedJson = async (url, options = {}) => {
	const { response, text } = await fetchBounded(url, options);
	if (!response.ok) throw configurationError(`External service returned HTTP ${response.status}`);
	try {
		return JSON.parse(text);
	} catch (error) {
		throw configurationError("External service returned invalid JSON", error);
	}
};

let lastKnownIps = { ipv4: null, ipv6: null };

/** @returns {Promise<{ipv4: string|null, ipv6: string|null}>} */
export const getWanIps = async () => {
	const result = { ipv4: null, ipv6: null };
	try {
		const data = await fetchBoundedJson("https://api.ipify.org?format=json");
		if (typeof data.ip === "string" && ipaddr.isValid(data.ip) && ipaddr.parse(data.ip).kind() === "ipv4") {
			assertPublicAddress(data.ip);
			result.ipv4 = data.ip;
		}
	} catch (error) {
		logger.debug(`DDNS: Failed to fetch WAN IPv4: ${redactError(error)}`);
	}
	try {
		const data = await fetchBoundedJson("https://api6.ipify.org?format=json");
		if (
			typeof data.ip === "string" &&
			ipaddr.IPv6.isValid(data.ip) &&
			!ipaddr.IPv6.parse(data.ip).isIPv4MappedAddress()
		) {
			assertPublicAddress(data.ip);
			result.ipv6 = data.ip;
		}
	} catch (error) {
		logger.debug(`DDNS: Failed to fetch WAN IPv6: ${redactError(error)}`);
	}
	return result;
};

const renderCustomUrl = (provider, ips) => {
	const template = provider.config?.url;
	if (typeof template !== "string" || !template) throw configurationError("Missing Custom URL");
	for (const match of template.matchAll(/{([^{}]+)}/g)) {
		if (!ALLOWED_CUSTOM_PLACEHOLDERS.has(match[1])) {
			throw configurationError(`Unsupported custom DDNS placeholder: {${match[1]}}`);
		}
	}
	const replacements = {
		IP: ips.ipv4 || ips.ipv6 || "",
		IPv4: ips.ipv4 || "",
		IPv6: ips.ipv6 || "",
		DOMAIN: provider.domains.join(","),
	};
	let finalUrl = template;
	for (const [placeholder, value] of Object.entries(replacements)) {
		finalUrl = finalUrl.replaceAll(`{${placeholder}}`, encodeURIComponent(value));
	}
	if (/[{}]/.test(finalUrl)) throw configurationError("Custom DDNS URL contains an invalid placeholder");
	return validatePublicUrl(finalUrl);
};

const validateProviderInput = (provider, ips) => {
	if (!Array.isArray(provider.domains) || provider.domains.length === 0 || provider.domains.length > 100) {
		throw configurationError("DDNS provider must contain between 1 and 100 domains");
	}
	if (
		provider.domains.some(
			(domain) =>
				typeof domain !== "string" ||
				domain.length === 0 ||
				domain.length > 253 ||
				domain.includes(",") ||
				[...domain].some((character) => {
					const codePoint = character.codePointAt(0) || 0;
					return codePoint <= 32 || codePoint === 127 || character.trim() === "";
				}),
		)
	) {
		throw configurationError("DDNS provider contains an invalid domain");
	}

	for (const [family, address] of [
		["ipv4", ips.ipv4],
		["ipv6", ips.ipv6],
	]) {
		if (address === null || typeof address === "undefined") continue;
		if (typeof address !== "string" || !ipaddr.isValid(address)) {
			throw configurationError(`DDNS ${family.toUpperCase()} address is invalid`);
		}
		const parsed = ipaddr.parse(address);
		if (family === "ipv4" && parsed.kind() !== "ipv4") {
			throw configurationError(`DDNS ${family.toUpperCase()} address has the wrong family`);
		}
		if (family === "ipv6" && (!ipaddr.IPv6.isValid(address) || ipaddr.IPv6.parse(address).isIPv4MappedAddress())) {
			throw configurationError(`DDNS ${family.toUpperCase()} address has the wrong family`);
		}
		assertPublicAddress(address);
	}
};

const providers = {
	cloudflare: async (provider, ips) => {
		const { token, zone_id: zoneId } = provider.config;
		if (
			typeof token !== "string" ||
			!token ||
			token.length > 4096 ||
			typeof zoneId !== "string" ||
			!zoneId ||
			zoneId.length > 256
		) {
			throw configurationError("Missing or invalid Cloudflare Token or Zone ID");
		}
		const results = [];
		const promises = [];
		for (const domain of provider.domains) {
			if (ips.ipv4) promises.push(updateCloudflareRecord(token, zoneId, domain, "A", ips.ipv4, results));
			if (ips.ipv6) promises.push(updateCloudflareRecord(token, zoneId, domain, "AAAA", ips.ipv6, results));
		}
		await Promise.all(promises);
		return `Updated ${results.length} record(s)`;
	},

	duckdns: async (provider, ips) => {
		const { token } = provider.config;
		if (typeof token !== "string" || !token || token.length > 4096) {
			throw configurationError("Missing or invalid DuckDNS Token");
		}
		const url = new URL("https://www.duckdns.org/update");
		url.searchParams.set("domains", provider.domains.join(","));
		url.searchParams.set("token", token);
		if (ips.ipv4) url.searchParams.set("ip", ips.ipv4);
		if (ips.ipv6) url.searchParams.set("ipv6", ips.ipv6);
		const { response, text } = await fetchBounded(url);
		if (!response.ok || text.trim() !== "OK") throw configurationError("DuckDNS rejected the update");
		return "Updated OK";
	},

	custom: async (provider, ips) => {
		const response = await requestCustomUrl(renderCustomUrl(provider, ips));
		if (response.status < 200 || response.status >= 300) {
			throw configurationError(`Custom DDNS service returned HTTP ${response.status}`);
		}
		return `Request accepted (${response.status})`;
	},
};

async function updateCloudflareRecord(token, zoneId, domain, type, ip, results) {
	const base = `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/dns_records`;
	const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
	try {
		const listUrl = `${base}?type=${encodeURIComponent(type)}&name=${encodeURIComponent(domain)}`;
		const listResult = await fetchBounded(listUrl, { headers });
		if (!listResult.response.ok) {
			throw configurationError(`Cloudflare lookup returned HTTP ${listResult.response.status}`);
		}
		let listData;
		try {
			listData = JSON.parse(listResult.text);
		} catch (error) {
			throw configurationError("Cloudflare lookup returned invalid JSON", error);
		}
		if (!listData.success || !Array.isArray(listData.result)) {
			throw configurationError(`Cloudflare lookup failed for ${domain} (${type})`);
		}
		const record = listData.result[0];
		if (record && (typeof record.id !== "string" || !record.id)) {
			throw configurationError(`Cloudflare lookup returned an invalid record for ${domain} (${type})`);
		}
		const updateResult = await fetchBounded(record ? `${base}/${encodeURIComponent(record.id)}` : base, {
			method: record ? "PUT" : "POST",
			headers,
			body: JSON.stringify({ type, name: domain, content: ip, ttl: 1, proxied: record?.proxied === true }),
		});
		if (!updateResult.response.ok) {
			throw configurationError(`Cloudflare update returned HTTP ${updateResult.response.status}`);
		}
		let data;
		try {
			data = JSON.parse(updateResult.text);
		} catch (error) {
			throw configurationError("Cloudflare update returned invalid JSON", error);
		}
		if (!data.success) throw configurationError(`Cloudflare update failed for ${domain} (${type})`);
		results.push(`${domain} (${type})`);
	} catch (error) {
		if (error instanceof errs.ConfigurationError) throw error;
		throw configurationError(`Cloudflare request failed for ${domain} (${type})`, error);
	}
}

/**
 * @param {DdnsProvider} provider
 * @param {{ipv4: string|null, ipv6: string|null}} ips
 * @returns {Promise<string>}
 */
export const updateProvider = async (provider, ips) => {
	const filteredIps = {
		ipv4: provider.ip_ver !== "v6" ? ips.ipv4 : null,
		ipv6: provider.ip_ver !== "v4" ? ips.ipv6 : null,
	};

	try {
		const handler = providers[provider.provider];
		if (!handler) throw new errs.ValidationError(`Unknown DDNS provider: ${provider.provider}`);
		validateProviderInput(provider, filteredIps);
		if (!filteredIps.ipv4 && !filteredIps.ipv6) {
			throw configurationError("No public WAN address is available for the selected IP version");
		}
		const result = await handler(provider, filteredIps);
		await /** @type {any} */ (DdnsProvider).query().patchAndFetchById(provider.id, {
			last_ipv4: filteredIps.ipv4,
			last_ipv6: filteredIps.ipv6,
			last_updated_on: dayjs().format("YYYY-MM-DD HH:mm:ss"),
			last_error: null,
		});
		logger.info(`DDNS [provider #${provider.id}]: update succeeded`);
		return result;
	} catch (error) {
		const message = redactError(error, provider);
		logger.error(`DDNS [provider #${provider.id}]: update failed: ${message}`);
		await /** @type {any} */ (DdnsProvider).query().patchAndFetchById(provider.id, { last_error: message });
		throw error instanceof errs.ConfigurationError ? error : configurationError(message, error);
	}
};

const runProcess = async (force) => {
	const providerList = await /** @type {any} */ (DdnsProvider).query().where("enabled", 1);
	if (providerList.length === 0) return;
	const currentIps = await getWanIps();
	const changed = currentIps.ipv4 !== lastKnownIps.ipv4 || currentIps.ipv6 !== lastKnownIps.ipv6;
	if (changed) {
		logger.info(
			`DDNS: WAN address availability changed (IPv4=${Boolean(currentIps.ipv4)}, IPv6=${Boolean(currentIps.ipv6)})`,
		);
		lastKnownIps = { ...currentIps };
	}

	for (const provider of providerList) {
		const v4Changed = provider.ip_ver !== "v6" && currentIps.ipv4 && provider.last_ipv4 !== currentIps.ipv4;
		const v6Changed = provider.ip_ver !== "v4" && currentIps.ipv6 && provider.last_ipv6 !== currentIps.ipv6;
		if (force || v4Changed || v6Changed) {
			try {
				await updateProvider(provider, currentIps);
			} catch {
				// updateProvider already persists and logs a redacted error; continue with independent providers.
			}
		}
	}
};

/** @param {boolean} [force] @returns {Promise<void>} */
export const process = (force = false) => {
	pendingForce ||= force;
	if (processPromise) return processPromise;
	processPromise = (async () => {
		do {
			const runForced = pendingForce;
			pendingForce = false;
			await runProcess(runForced);
		} while (pendingForce);
	})()
		.catch((error) => logger.error(`DDNS: polling failed: ${redactError(error)}`))
		.finally(() => {
			processPromise = null;
			if (pendingForce) void process();
		});
	return processPromise;
};

export const initTimer = () => {
	if (timer) clearInterval(timer);
	if (startupTimer) clearTimeout(startupTimer);
	timer = setInterval(() => void process(), INTERVAL);
	startupTimer = setTimeout(() => void process(), 5000);
	for (const handle of [timer, startupTimer]) handle.unref?.();
};

/** Stop scheduling new work and wait for the in-flight pass. */
export const stop = async () => {
	if (timer) clearInterval(timer);
	if (startupTimer) clearTimeout(startupTimer);
	timer = null;
	startupTimer = null;
	while (processPromise) await processPromise;
};

export const __test = { assertPublicAddress, redactError, renderCustomUrl, requestCustomUrl, validatePublicUrl };

export default { initTimer, process, getWanIps, updateProvider, stop };
