/** Preserve the old effective WAF ruleset before Cache Assets gains independent semantics. */
const up = async (knex) => {
	const rows = await knex("proxy_host").select("id", "meta", "caching_enabled", "forward_scheme");
	for (const row of rows) {
		let meta = row.meta;
		for (let depth = 0; depth < 2 && typeof meta === "string"; depth++) {
			try {
				meta = JSON.parse(meta);
			} catch {
				meta = {};
			}
		}
		if (!meta || typeof meta !== "object" || Array.isArray(meta)) meta = {};
		const next = { ...meta };
		if (next.waf_ruleset === undefined) next.waf_ruleset = row.caching_enabled ? "crs" : "base";
		if (row.caching_enabled && !["http", "https"].includes(row.forward_scheme) && next.cache_policy === undefined)
			next.cache_policy = { enabled: false };
		if (JSON.stringify(next) === JSON.stringify(meta)) continue;
		await knex("proxy_host")
			.where("id", row.id)
			.update({ meta: JSON.stringify(next) });
	}
};
// Keep the explicit policy on rollback; removing it would silently alter WAF protection.
const down = async () => {};

export { down, up };
