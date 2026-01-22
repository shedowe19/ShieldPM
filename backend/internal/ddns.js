import dayjs from "dayjs";
import DdnsProvider from "../models/ddns_provider.js";
import { global as logger } from "../logger.js";

let timer = null;
const INTERVAL = 1000 * 60; // 60 seconds

/**
 * Get current WAN IPs (v4 and v6)
 * @returns {Promise<{ipv4: string|null, ipv6: string|null}>}
 */
export const getWanIps = async () => {
	const result = { ipv4: null, ipv6: null };

	// Fetch IPv4
	try {
		const res4 = await fetch("https://api.ipify.org?format=json");
		if (res4.ok) {
			const data = await res4.json();
			result.ipv4 = data.ip;
		}
	} catch (err) {
		// Ignore v4 failure if we strictly want what's available
		logger.debug("DDNS: Failed to fetch WAN IPv4", err.message);
	}

	// Fetch IPv6
	try {
		const res6 = await fetch("https://api6.ipify.org?format=json");
		if (res6.ok) {
			const data = await res6.json();
			// Ensure it's actually an IPv6 address (ipify might return v4 on api6 if only v4 available? No, api6 usually dual stack but returns what connects)
			// Actually api6.ipify.org returns the IP you connect with. If you connect via v4, it returns v4.
			// To strictly force v6, we rely on the OS networking.
			// A better approach is `https://api64.ipify.org` returns the one used.
			// But we want BOTH.
			// Only way to force v6 is if the system supports it.
			// Let's assume if the result contains a colon, it's v6.
			if (data.ip.includes(":")) {
				result.ipv6 = data.ip;
			}
		}
	} catch (err) {
		logger.debug("DDNS: Failed to fetch WAN IPv6", err.message);
	}

	return result;
};

const providers = {
	cloudflare: async (provider, ips) => {
		const { token, zone_id } = provider.config;
		if (!token || !zone_id) throw new Error("Missing Cloudflare Token or Zone ID");

		const results = [];

		for (const domain of provider.domains) {
			// Handle IPv4 (A Record)
			if (ips.ipv4) {
				await updateCloudflareRecord(token, zone_id, domain, "A", ips.ipv4, results);
			}

			// Handle IPv6 (AAAA Record)
			if (ips.ipv6) {
				await updateCloudflareRecord(token, zone_id, domain, "AAAA", ips.ipv6, results);
			}
		}
		return `Updated: ${results.join(", ")}`;
	},

	duckdns: async (provider, ips) => {
		const { token } = provider.config;
		if (!token) throw new Error("Missing DuckDNS Token");

		// DuckDNS supports comma separated domains
		const domainsStr = provider.domains.join(",");
		let url = `https://www.duckdns.org/update?domains=${domainsStr}&token=${token}`;

		if (ips.ipv4) url += `&ip=${ips.ipv4}`;
		if (ips.ipv6) url += `&ipv6=${ips.ipv6}`;

		const res = await fetch(url);
		const text = await res.text();

		if (text !== "OK") {
			throw new Error(`DuckDNS Error: ${text}`);
		}
		return "Updated OK";
	},

	custom: async (provider, ips) => {
		const { url } = provider.config;
		if (!url) throw new Error("Missing Custom URL");

		let finalUrl = url;
		if (ips.ipv4) finalUrl = finalUrl.replace(/{IP}/g, ips.ipv4).replace(/{IPv4}/g, ips.ipv4);
		else finalUrl = finalUrl.replace(/{IP}/g, "").replace(/{IPv4}/g, "");

		if (ips.ipv6) finalUrl = finalUrl.replace(/{IPv6}/g, ips.ipv6);
		else finalUrl = finalUrl.replace(/{IPv6}/g, "");

		finalUrl = finalUrl.replace(/{DOMAIN}/g, provider.domains.join(","));

		const res = await fetch(finalUrl);
		if (!res.ok) {
			throw new Error(`Custom URL Error: ${res.status} ${res.statusText}`);
		}
		return `Request sent: ${res.status}`;
	},
};

/**
 * Helper for Cloudflare
 */
async function updateCloudflareRecord(token, zone_id, domain, type, ip, results) {
	// 1. Get Record ID
	const listRes = await fetch(
		`https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records?type=${type}&name=${domain}`,
		{
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
		},
	);
	const listData = await listRes.json();

	if (!listData.success) {
		throw new Error(`Cloudflare List Error for ${domain} (${type}): ${JSON.stringify(listData.errors)}`);
	}

	let recordId = null;
	let proxied = false;

	if (listData.result.length > 0) {
		recordId = listData.result[0].id;
		proxied = listData.result[0].proxied;
	}

	// 2. Create or Update Record
	const method = recordId ? "PUT" : "POST";
	const url = recordId
		? `https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records/${recordId}`
		: `https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records`;

	const updateRes = await fetch(url, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			type,
			name: domain,
			content: ip,
			ttl: 1, // Auto
			proxied,
		}),
	});

	const updateData = await updateRes.json();
	if (!updateData.success) {
		throw new Error(`Cloudflare Update Error for ${domain} (${type}): ${JSON.stringify(updateData.errors)}`);
	}
	results.push(`${domain} (${type})`);
}

/**
 * Update a specific provider
 * @param {DdnsProvider} provider
 * @param {{ipv4: string|null, ipv6: string|null}} ips
 */
export const updateProvider = async (provider, ips) => {
	try {
		const handler = providers[provider.provider];
		if (!handler) throw new Error(`Unknown provider: ${provider.provider}`);

		// Filter IPs based on ip_ver preference
		const filteredIps = {
			ipv4: provider.ip_ver !== "v6" ? ips.ipv4 : null,
			ipv6: provider.ip_ver !== "v4" ? ips.ipv6 : null,
		};

		// If filtering results in no IPs (e.g. v4 only but no v4 WAN), we should probably skip or log?
		// But let the handler decide or just send empty updates (for custom placeholders to be cleared)

		const result = await handler(provider, filteredIps);

		await /** @type {any} */ (DdnsProvider)
			.query()
			.patchAndFetchById(provider.id, {
				last_ipv4: filteredIps.ipv4, // Only save what we intended to update
				last_ipv6: filteredIps.ipv6,
				last_updated_on: dayjs().format("YYYY-MM-DD HH:mm:ss"),
				last_error: null,
			});

		logger.info(`DDNS [${provider.name}]: Success - ${result}`);
	} catch (err) {
		logger.error(`DDNS [${provider.name}]: Failed - ${err.message}`);
		await /** @type {any} */ (DdnsProvider)
			.query()
			.patchAndFetchById(provider.id, {
				last_error: err.message,
			});
	}
};

/**
 * Main Process
 * @param {boolean} force - Force update even if IP hasn't changed
 */
export const process = async (force = false) => {
	try {
		const providersList = await /** @type {any} */ (DdnsProvider)
			.query()
			.where("enabled", 1);
		if (providersList.length === 0) return;

		const currentIps = await getWanIps();
		logger.info(`DDNS: Current WAN IPs - v4: ${currentIps.ipv4}, v6: ${currentIps.ipv6}`);

		for (const provider of providersList) {
			const v4Changed = provider.ip_ver !== "v6" && currentIps.ipv4 && provider.last_ipv4 !== currentIps.ipv4;
			const v6Changed = provider.ip_ver !== "v4" && currentIps.ipv6 && provider.last_ipv6 !== currentIps.ipv6;

			if (force || v4Changed || v6Changed) {
				logger.info(`DDNS: IP changed for ${provider.name} (IP Ver: ${provider.ip_ver}) or Force Update`);
				await updateProvider(provider, currentIps);
			}
		}
	} catch (err) {
		logger.error("DDNS: Process failed", err);
	}
};

/**
 * Initialize Timer
 */
export const initTimer = () => {
	if (timer) clearInterval(timer);
	timer = setInterval(() => process(), INTERVAL);
	// Run once on startup after a small delay
	setTimeout(() => process(), 5000);
};

export default {
	initTimer,
	process,
	getWanIps,
	updateProvider,
};
