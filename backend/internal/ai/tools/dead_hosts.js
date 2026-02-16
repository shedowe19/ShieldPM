import internalDeadHost from "../../dead-host.js";

export const get_dead_hosts = async (access, args) => {
	const hosts = await internalDeadHost.getAll(access);
	return JSON.stringify(
		hosts.map((h) => ({
			id: h.id,
			domain_names: h.domain_names,
			enabled: h.enabled,
		})),
	);
};

export const create_dead_host = async (access, args) => {
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
	const newHost = await internalDeadHost.create(access, data);
	return `Created 404 Host ID: ${newHost.id}`;
};

export const update_dead_host = async (access, args) => {
	await internalDeadHost.update(access, { id: args.id, ...args });
	return `Updated Dead Host ID: ${args.id}`;
};

export const delete_dead_host = async (access, args) => {
	await internalDeadHost.delete(access, { id: args.id });
	return `Deleted 404 Host ID: ${args.id}`;
};

export const enable_dead_host = async (access, args) => {
	await internalDeadHost.enable(access, { id: args.id });
	return `Enabled 404 Host ID: ${args.id}`;
};

export const disable_dead_host = async (access, args) => {
	await internalDeadHost.disable(access, { id: args.id });
	return `Disabled 404 Host ID: ${args.id}`;
};
