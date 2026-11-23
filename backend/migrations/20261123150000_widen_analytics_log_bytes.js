/**
 * `analytics_logs.bytes` was created as a signed 32-bit integer. A single
 * response larger than 2 GiB overflows that range and MariaDB rejects the
 * whole insert batch, so one large download could stop the analytics backfill
 * from advancing. Byte counts are now stored as BIGINT.
 *
 * SQLite stores integers with dynamic width and ignores the declared type, so
 * the change is only needed for the server databases.
 */
const supportsColumnTypeChange = (knex) =>
	!["sqlite3", "better-sqlite3"].includes(knex.client.config.client);

export const up = async (knex) => {
	if (!supportsColumnTypeChange(knex)) return;
	if (!(await knex.schema.hasColumn("analytics_logs", "bytes"))) return;
	await knex.schema.alterTable("analytics_logs", (table) => {
		table.bigInteger("bytes").alter();
	});
};

export const down = async (knex) => {
	if (!supportsColumnTypeChange(knex)) return;
	await knex.schema.alterTable("analytics_logs", (table) => {
		table.integer("bytes").alter();
	});
};
