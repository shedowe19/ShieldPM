const providers = {
	cloudflare: async (provider, ips, updateCloudflareRecord) => {
		const { token, zone_id } = provider.config;
		if (!token || !zone_id) throw new Error("Missing Cloudflare Token or Zone ID");
		const results = [];
		const promises = [];
		for (const domain of provider.domains) {
			if (ips.ipv4) promises.push(updateCloudflareRecord(token, zone_id, domain, "A", ips.ipv4, results));
			if (ips.ipv6) promises.push(updateCloudflareRecord(token, zone_id, domain, "AAAA", ips.ipv6, results));
		}
		await Promise.all(promises);
		return `Updated: ${results.join(", ")}`;
	},
	duckdns: async (provider, ips) => {
		const { token } = provider.config;
		if (!token) throw new Error("Missing DuckDNS Token");
		const domainsStr = provider.domains.join(",");
		let url = `https://www.duckdns.org/update?domains=${domainsStr}&token=${token}`;
		if (ips.ipv4) url += `&ip=${ips.ipv4}`;
		if (ips.ipv6) url += `&ipv6=${ips.ipv6}`;
		const res = await fetch(url);
		const text = await res.text();
		if (text !== "OK") throw new Error(`DuckDNS Error: ${text}`);
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
		if (!res.ok) throw new Error(`Custom URL Error: ${res.status} ${res.statusText}`);
		return `Request sent: ${res.status}`;
	},
};

export { providers };
