import dayjs from "dayjs";
import { global as logger } from "../../logger.js";
import DdnsProvider from "../../models/ddns_provider.js";
import { getLastKnownIps, getTimer, INTERVAL, setLastKnownIps, setTimer } from "./helpers.js";
import { providers } from "./providers.js";

const getWanIps = async () => {
	const result = { ipv4: null, ipv6: null };
	try {
		const res4 = await fetch("https://api.ipify.org?format=json");
		if (res4.ok) {
			const data = await res4.json();
			result.ipv4 = data.ip;
		}
	} catch (err) {
		logger.debug("DDNS: Failed to fetch WAN IPv4", err.message);
	}
	try {
		const res6 = await fetch("https://api6.ipify.org?format=json");
		if (res6.ok) {
			const data = await res6.json();
			if (data.ip.includes(":")) result.ipv6 = data.ip;
		}
	} catch (err) {
		logger.debug("DDNS: Failed to fetch WAN IPv6", err.message);
	}
	return result;
};

async function updateCloudflareRecord(token, zone_id, domain, type, ip, results) {
	const listRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records?type=${type}&name=${domain}`, {
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
	});
	const listData = await listRes.json();
	if (!listData.success) throw new Error(`Cloudflare List Error for ${domain} (${type}): ${JSON.stringify(listData.errors)}`);
	let recordId = null;
	let proxied = false;
	if (listData.result.length > 0) {
		recordId = listData.result[0].id;
		proxied = listData.result[0].proxied;
	}
	const method = recordId ? "PUT" : "POST";
	const url = recordId
		? `https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records/${recordId}`
		: `https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records`;
	const updateRes = await fetch(url, {
		method,
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		body: JSON.stringify({ type, name: domain, content: ip, ttl: 1, proxied }),
	});
	const updateData = await updateRes.json();
	if (!updateData.success) throw new Error(`Cloudflare Update Error for ${domain} (${type}): ${JSON.stringify(updateData.errors)}`);
	results.push(`${domain} (${type})`);
}

const updateProvider = async (provider, ips) => {
	try {
		const handler = providers[provider.provider];
		if (!handler) throw new Error(`Unknown provider: ${provider.provider}`);
		const filteredIps = { ipv4: provider.ip_ver !== "v6" ? ips.ipv4 : null, ipv6: provider.ip_ver !== "v4" ? ips.ipv6 : null };
		const result = await handler(provider, filteredIps, updateCloudflareRecord);
		await DdnsProvider.query().patchAndFetchById(provider.id, {
			last_ipv4: filteredIps.ipv4,
			last_ipv6: filteredIps.ipv6,
			last_updated_on: dayjs().format("YYYY-MM-DD HH:mm:ss"),
			last_error: null,
		});
		logger.info(`DDNS [${provider.name}]: Success - ${result}`);
	} catch (err) {
		logger.error(`DDNS [${provider.name}]: Failed - ${err.message}`);
		await DdnsProvider.query().patchAndFetchById(provider.id, { last_error: err.message });
	}
};

const process = async (force = false) => {
	try {
		const providersList = await DdnsProvider.query().where("enabled", 1);
		if (providersList.length === 0) return;
		const currentIps = await getWanIps();
		const lastKnownIps = getLastKnownIps();
		const wanIpsChanged = currentIps.ipv4 !== lastKnownIps.ipv4 || currentIps.ipv6 !== lastKnownIps.ipv6;
		if (wanIpsChanged) {
			logger.info(`DDNS: WAN IPs changed - v4: ${currentIps.ipv4}, v6: ${currentIps.ipv6}`);
			setLastKnownIps(currentIps);
		}
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

const initTimer = () => {
	const timer = getTimer();
	if (timer) clearInterval(timer);
	setTimer(setInterval(() => process(), INTERVAL));
	setTimeout(() => process(), 5000);
};

export default { initTimer, process, getWanIps, updateProvider };
