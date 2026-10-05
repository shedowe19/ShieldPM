import dns from "node:dns/promises";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { TextDecoder } from "node:util";
import ipaddr from "ipaddr.js";
import errs from "./error.js";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const DOWNLOAD_TIMEOUT = 15_000;
// The lookup key is never resolved by DNS: pinnedLookup supplies every transport address.
const PINNED_TRANSPORT_HOST = "shieldpm-firewall-download.invalid";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
// biome-ignore lint/suspicious/noControlCharactersInRegex: Reject controls before URL parsing can normalize them away.
const UNSAFE_URL_CHARACTERS = /[\s\u0000-\u001f\u007f]/u;
const BLOCKED_IPV6_RANGES = ["2001::/23", "2001:db8::/32", "2002::/16", "3fff::/20"].map((range) =>
	ipaddr.parseCIDR(range),
);

/**
 * Permit globally routable addresses only, including when IPv4 is represented as IPv6.
 * Special purpose networks and cloud platform metadata destinations are never sources.
 * @param {string} address
 * @returns {boolean}
 */
export function isPublicAddress(address) {
	if (typeof address !== "string" || address.includes("%") || !net.isIP(address)) {
		return false;
	}
	try {
		const parsed = ipaddr.parse(address);
		const normalized =
			parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress() ? parsed.toIPv4Address() : parsed;
		if (normalized.kind() === "ipv4") {
			return normalized.range() === "unicast" && normalized.toString() !== "168.63.129.16";
		}
		// Only global unicast allocations are valid; this also excludes NAT64 and local translations.
		return (
			normalized.range() === "unicast" &&
			normalized.match(ipaddr.parseCIDR("2000::/3")) &&
			!BLOCKED_IPV6_RANGES.some((range) => normalized.match(range))
		);
	} catch {
		return false;
	}
}

/**
 * Validate source syntax before any DNS resolution or connection.
 * @param {string} sourceUrl
 * @returns {URL}
 */
export function validateSourceUrl(sourceUrl) {
	if (
		typeof sourceUrl !== "string" ||
		!sourceUrl ||
		sourceUrl.length > 2048 ||
		!/^https:\/\//i.test(sourceUrl) ||
		UNSAFE_URL_CHARACTERS.test(sourceUrl) ||
		sourceUrl.includes("\\") ||
		sourceUrl.includes("#")
	) {
		throw new errs.ValidationError(
			"Firewall list source must be an HTTPS URL without a fragment (maximum 2048 characters)",
		);
	}
	let url;
	try {
		url = new URL(sourceUrl);
	} catch (error) {
		throw new errs.ValidationError("Firewall list source URL is invalid", error);
	}
	const authority = sourceUrl.match(/^https:\/\/([^/?#]*)/i)?.[1];
	if (
		url.protocol !== "https:" ||
		!url.hostname ||
		url.username ||
		url.password ||
		url.hash ||
		url.href.length > 2048 ||
		authority?.includes("@")
	) {
		throw new errs.ValidationError("Firewall list source requires HTTPS without credentials or a fragment");
	}
	const hostname = url.hostname.replace(/^\[|\]$/g, "");
	if (net.isIP(hostname) && !isPublicAddress(hostname)) {
		throw new errs.ValidationError("Firewall list source must resolve only to public IP addresses");
	}
	return url;
}

async function resolvePublicAddresses(url, signal) {
	signal.throwIfAborted();
	const hostname = url.hostname.replace(/^\[|\]$/g, "");
	const literalFamily = net.isIP(hostname);
	const addresses = literalFamily
		? [{ address: hostname, family: literalFamily }]
		: await dns.lookup(hostname, { all: true, verbatim: true });
	signal.throwIfAborted();
	if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
		throw new errs.ValidationError("Firewall list source must resolve only to public IP addresses");
	}
	return addresses;
}

function pinnedLookup(addresses) {
	return (_hostname, options, callback) => {
		const family = typeof options === "number" ? options : options?.family;
		const candidates = family ? addresses.filter((address) => address.family === family) : addresses;
		if (!candidates.length) {
			callback(new errs.ValidationError("Firewall list source has no validated address for this IP family"));
		} else if (options?.all) {
			callback(null, candidates);
		} else {
			callback(null, candidates[0].address, candidates[0].family);
		}
	};
}

function readResponse(url, addresses, signal) {
	const originHostname = url.hostname.replace(/^\[|\]$/g, "");
	return new Promise((resolve, reject) => {
		let settled = false;
		let request;
		let response;
		const finish = (error, value) => {
			if (settled) {
				return;
			}
			settled = true;
			if (error) {
				reject(error);
				response?.destroy();
				request?.destroy();
			} else {
				resolve(value);
			}
		};
		request = https.get(
			{
				// Separate connection routing from origin identity. A constant lookup key preserves
				// Node's address-family fallback while only validated candidates reach the socket.
				hostname: PINNED_TRANSPORT_HOST,
				port: url.port || 443,
				path: `${url.pathname}${url.search}`,
				agent: false,
				signal,
				rejectUnauthorized: true,
				lookup: pinnedLookup(addresses),
				servername: net.isIP(originHostname) ? "" : originHostname,
				checkServerIdentity: (_servername, certificate) => tls.checkServerIdentity(originHostname, certificate),
				headers: {
					Host: url.host,
					"Accept-Encoding": "identity",
					"User-Agent": "ShieldPM-Firewall-Lists",
				},
			},
			(incoming) => {
				response = incoming;
				incoming.on("error", (error) =>
					finish(new errs.ValidationError("Firewall list download failed", error)),
				);
				if (REDIRECT_STATUSES.has(incoming.statusCode)) {
					if (typeof incoming.headers.location !== "string" || !incoming.headers.location) {
						finish(new errs.ValidationError("Firewall list redirect is missing its destination"));
						return;
					}
					finish(null, { redirect: incoming.headers.location });
					incoming.destroy();
					request.destroy();
					return;
				}
				if (incoming.statusCode !== 200) {
					finish(new errs.ValidationError(`Firewall list source returned HTTP ${incoming.statusCode}`));
					return;
				}
				const encoding = incoming.headers["content-encoding"];
				if (encoding && String(encoding).trim().toLowerCase() !== "identity") {
					finish(new errs.ValidationError("Firewall list source must return uncompressed text"));
					return;
				}
				const lengthHeader = incoming.headers["content-length"];
				const expectedBytes = lengthHeader === undefined ? undefined : Number(lengthHeader);
				if (
					expectedBytes !== undefined &&
					(!/^\d+$/.test(String(lengthHeader)) ||
						!Number.isSafeInteger(expectedBytes) ||
						expectedBytes > MAX_BYTES)
				) {
					finish(
						new errs.ValidationError(
							"Firewall list download exceeds the 8 MiB limit or has an invalid size",
						),
					);
					return;
				}
				const chunks = [];
				let receivedBytes = 0;
				incoming.on("data", (chunk) => {
					if (settled) {
						return;
					}
					const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
					receivedBytes += buffer.length;
					if (receivedBytes > MAX_BYTES) {
						finish(new errs.ValidationError("Firewall list download exceeds the 8 MiB limit"));
						return;
					}
					chunks.push(buffer);
				});
				incoming.on("aborted", () => finish(new errs.ValidationError("Firewall list download was incomplete")));
				incoming.on("close", () => {
					if (!incoming.complete) {
						finish(new errs.ValidationError("Firewall list download was incomplete"));
					}
				});
				incoming.on("end", () => {
					if (!incoming.complete || (expectedBytes !== undefined && expectedBytes !== receivedBytes)) {
						finish(new errs.ValidationError("Firewall list download was incomplete"));
						return;
					}
					try {
						const text = new TextDecoder("utf-8", { fatal: true }).decode(
							Buffer.concat(chunks, receivedBytes),
						);
						finish(null, { text });
					} catch (error) {
						finish(new errs.ValidationError("Firewall list source must contain valid UTF-8 text", error));
					}
				});
			},
		);
		request.on("error", (error) => finish(new errs.ValidationError("Firewall list download failed", error)));
	});
}

async function download(sourceUrl, signal) {
	let currentUrl = validateSourceUrl(sourceUrl);
	for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
		const addresses = await resolvePublicAddresses(currentUrl, signal);
		const result = await readResponse(currentUrl, addresses, signal);
		if (result.text !== undefined) {
			return result.text;
		}
		if (redirects === MAX_REDIRECTS) {
			throw new errs.ValidationError("Firewall list source exceeded the maximum of 3 redirects");
		}
		try {
			currentUrl = validateSourceUrl(new URL(result.redirect, currentUrl).href);
		} catch (error) {
			throw new errs.ValidationError("Firewall list redirect destination is invalid or not public HTTPS", error);
		}
	}
}

/**
 * Download a bounded UTF-8 IP list directly over HTTPS, with one deadline covering DNS and all redirects.
 * Each destination is checked before connection and its DNS answers are pinned for the TLS connection.
 * @param {string} sourceUrl
 * @returns {Promise<string>}
 */
export async function fetchIpList(sourceUrl) {
	const controller = new AbortController();
	let timeout;
	const deadline = new Promise((_resolve, reject) => {
		timeout = setTimeout(() => {
			const error = new errs.ValidationError("Firewall list download exceeded the 15 second timeout");
			controller.abort(error);
			reject(error);
		}, DOWNLOAD_TIMEOUT);
	});
	try {
		return await Promise.race([download(sourceUrl, controller.signal), deadline]);
	} catch (error) {
		controller.abort(error);
		throw error instanceof errs.ValidationError
			? error
			: new errs.ValidationError("Firewall list download failed", error);
	} finally {
		clearTimeout(timeout);
	}
}
