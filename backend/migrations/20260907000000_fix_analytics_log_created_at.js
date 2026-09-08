import { migrate as logger } from "../logger.js";

const tableName = "analytics_logs";

export const up = async (knex) => {
	if (!(await knex.schema.hasTable(tableName))) return;
	await knex.schema.alterTable(tableName, (table) => {
		table.bigInteger("created_at").nullable().defaultTo(0).alter();
	});
	if (["better-sqlite3", "sqlite3"].includes(knex.client.config.client)) {
		// The old SQLite default stored UTC timestamp text in a bigint column. Keep numeric milliseconds intact.
		await knex(tableName)
			.whereRaw("typeof(??) = 'text' AND strftime('%s', ??) IS NOT NULL", ["created_at", "created_at"])
			.update({ created_at: knex.raw("CAST(strftime('%s', ??) AS INTEGER) * 1000", ["created_at"]) });
	}
	logger.info("[fix_analytics_log_created_at] Corrected the numeric analytics timestamp default");
};

// Restoring CURRENT_TIMESTAMP would make the bigint schema invalid again on server databases.
export const down = async () => {
	logger.warn("[fix_analytics_log_created_at] Keeping the compatible numeric timestamp default");
};
