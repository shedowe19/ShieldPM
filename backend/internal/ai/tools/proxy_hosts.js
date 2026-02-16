import internalProxyHost from "../../proxy-host.js";

export const get_proxy_hosts = async (access, args) => {
	const hosts = await internalProxyHost.getAll(access, [], "");
	return JSON.stringify(
		hosts.map((h) => ({
			id: h.id,
			domain_names: h.domain_names,
			forward_scheme: h.forward_scheme,
			forward_host: h.forward_host,
			forward_port: h.forward_port,
			access_list_id: h.access_list_id,
			enabled: h.enabled,
		})),
	);
};

export const create_proxy_host = async (access, args) => {
	// Certificate handling
	let certId = 0;
	let meta = {};

	if (args.request_ssl) {
		certId = "new";
		meta = {
			letsencrypt_email: args.email || "admin@example.com",
			letsencrypt_agree: true,
			dns_challenge: false,
		};
	}

	const data = {
		certificate_id: certId,
		access_list_id: 0,
		ssl_forced: args.ssl_forced || false,
		caching_enabled: false,
		block_exploits: true,
		meta: meta,
		...args,
		advanced_config: args.advanced_config || "",
	};

	const newHost = await internalProxyHost.create(access, data);
	return `Created Proxy Host ID: ${newHost.id}`;
};

export const update_proxy_host = async (access, args) => {
	await internalProxyHost.update(access, { id: args.id, ...args });
	return `Updated Proxy Host ID: ${args.id}`;
};

export const delete_proxy_host = async (access, args) => {
	await internalProxyHost.delete(access, { id: args.id });
	// Verification
	const remainingHosts = await internalProxyHost.getAll(access, [], "");
	const stillExists = remainingHosts.some((h) => h.id === args.id);
	if (stillExists) {
		return `ERROR: Delete failed! Proxy Host ID ${args.id} still exists!`;
	}
	return `Deleted and VERIFIED: Proxy Host ID ${args.id} no longer exists.`;
};

export const enable_proxy_host = async (access, args) => {
	await internalProxyHost.enable(access, { id: args.id });
	return `Enabled Proxy Host ID: ${args.id}`;
};

export const disable_proxy_host = async (access, args) => {
	await internalProxyHost.disable(access, { id: args.id });
	return `Disabled Proxy Host ID: ${args.id}`;
};
