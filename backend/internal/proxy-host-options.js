import ProxyHost from "../models/proxy_host.js";

const proxyHostOptions = {
	/**
	 * Retrieve authorized selector labels without loading host credentials or runtime configuration.
	 * @param {import('../lib/types.js').Access} access
	 * @param {string} [query]
	 * @returns {Promise<{id: number, domain_names: string[]}[]>}
	 */
	async get(access, query = "") {
		const grant = await access.can("proxy_hosts:list");
		const builder = ProxyHost.query()
			.where("is_deleted", 0)
			.select("id")
			.withGraphFetched("host_domains")
			.orderBy("id");
		if (grant.permission_visibility !== "all") builder.where("owner_user_id", access.token.getUserId(1));
		if (query)
			builder.whereExists(
				ProxyHost.relatedQuery("host_domains").where(
					"domain_name",
					"like",
					`%${query.replaceAll("%", "").replaceAll("_", "")}%`,
				),
			);
		return (await builder).map((host) => ({
			id: host.id,
			domain_names: host.host_domains.map((domain) => domain.domain_name),
		}));
	},
};

export default proxyHostOptions;
