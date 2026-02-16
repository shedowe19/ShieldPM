import internalRedirectionHost from "../../redirection-host.js";

export const get_redirection_hosts = async (access, args) => {
	const hosts = await internalRedirectionHost.getAll(access);
	return JSON.stringify(
		hosts.map((h) => ({
			id: h.id,
			domain_names: h.domain_names,
			forward_http_code: h.forward_http_code,
			forward_scheme: h.forward_scheme,
			forward_domain_name: h.forward_domain_name,
			enabled: h.enabled,
		})),
	);
};

export const create_redirection_host = async (access, args) => {
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
		ssl_forced: args.ssl_forced || false,
		hsts_enabled: args.hsts_enabled || false,
		hsts_subdomains: args.hsts_subdomains || false,
		block_exploits: true,
		advanced_config: "",
		meta: meta,
		...args,
	};
	const newHost = await internalRedirectionHost.create(access, data);
	return `Created Redirection Host ID: ${newHost.id}`;
};

export const update_redirection_host = async (access, args) => {
	await internalRedirectionHost.update(access, { id: args.id, ...args });
	return `Updated Redirection Host ID: ${args.id}`;
};

export const delete_redirection_host = async (access, args) => {
	await internalRedirectionHost.delete(access, { id: args.id });
	return `Deleted Redirection Host ID: ${args.id}`;
};

export const enable_redirection_host = async (access, args) => {
	await internalRedirectionHost.enable(access, { id: args.id });
	return `Enabled Redirection Host ID: ${args.id}`;
};

export const disable_redirection_host = async (access, args) => {
	await internalRedirectionHost.disable(access, { id: args.id });
	return `Disabled Redirection Host ID: ${args.id}`;
};
