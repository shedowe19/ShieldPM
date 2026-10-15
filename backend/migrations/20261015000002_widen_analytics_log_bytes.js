import { migrate as logger } from "../logger.js";

export const up = async (knex) => {
	if (!(await knex.schema.hasTable("analytics_logs"))) return;
	await knex.schema.alterTable("analytics_logs", (table) => {
		table.bigInteger("bytes").nullable().alter();
	});
	logger.info("[widen_analytics_log_bytes] Analytics details support downloads larger than 2 GiB");
};

// Valid downloaded-byte counts may no longer fit INTEGER. Preserve them on rollback.
export const down = async () => {
	logger.warn("[widen_analytics_log_bytes] Keeping BIGINT bytes to preserve existing downloads");
};
