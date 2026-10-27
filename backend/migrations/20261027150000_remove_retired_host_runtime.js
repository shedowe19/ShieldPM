import {
	hasActiveRetiredHostBindings,
	readRetiredHostMetadata,
	retireHostRuntime,
} from "../lib/retired-host-metadata.js";
import { migrate as logger } from "../logger.js";

/** Remove only retired runtime metadata; host rows and unrelated settings remain unchanged. */
export const up = async (knex) => {
	if (!(await knex.schema.hasTable("proxy_host"))) return [];
	logger.info("[remove_retired_host_runtime] Removing retired host runtime metadata");
	const disabledHostIds = [];
	let cursor = null;
	for (;;) {
		const query = knex("proxy_host").select("id", "meta", "enabled").orderBy("id").limit(250);
		if (cursor !== null) query.where("id", ">", cursor);
		const rows = await query;
		if (!rows.length) break;
		for (const row of rows) {
			cursor = row.id;
			if (row.meta === null || row.meta === undefined) continue;
			const meta = readRetiredHostMetadata(row.meta);
			const retired = retireHostRuntime({ ...row, meta });
			if (hasActiveRetiredHostBindings(meta)) disabledHostIds.push(row.id);
			if (JSON.stringify(meta) !== JSON.stringify(retired.meta) || retired.enabled !== row.enabled)
				await knex("proxy_host")
					.where("id", row.id)
					.update({ meta: JSON.stringify(retired.meta), enabled: retired.enabled });
		}
	}
	if (disabledHostIds.length)
		logger.info(
			`[remove_retired_host_runtime] Kept ${disabledHostIds.length} affected hosts disabled: removed request filters require review before re-enabling`,
		);
	return disabledHostIds;
};

// Removed runtime settings must not be resurrected by a migration rollback.
export const down = async () => {};
