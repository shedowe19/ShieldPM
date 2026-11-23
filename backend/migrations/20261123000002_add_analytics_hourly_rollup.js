import { migrate as logger } from "../logger.js";

const migrateName = "add_analytics_hourly_rollup";
const hourlyTable = "analytics_hourly";
const rollupStateTable = "analytics_rollup_state";
const detailTable = "analytics_logs";
const detailTimeIndex = "analytics_logs_time_index";
const hourlyUniqueIndex = "analytics_hourly_bucket_key_start_unique";
const hourlyBucketIndex = "analytics_hourly_bucket_start_index";
const hourlyHostIndex = "analytics_hourly_host_start_index";

const hasIndex = async (knex, tableName, indexName) => {
	const client = knex.client.config.client;

	if (client === "better-sqlite3" || client === "sqlite3") {
		// PRAGMA does not accept bound parameters; the table name is a migration constant.
		const indexes = await knex.raw(`PRAGMA index_list('${tableName}')`);
		return indexes.some((index) => index.name === indexName);
	}

	if (["mysql", "mysql2"].includes(client)) {
		const result = await knex.raw("SHOW INDEX FROM ?? WHERE Key_name = ?", [tableName, indexName]);
		const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
		return Array.isArray(rows) && rows.length > 0;
	}

	if (client === "pg") {
		const result = await knex.raw(
			"SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = ? AND indexname = ?",
			[tableName, indexName],
		);
		return result.rows.length > 0;
	}

	return true;
};

const createHourlyTable = async (knex) => {
	if (await knex.schema.hasTable(hourlyTable)) return;

	await knex.schema.createTable(hourlyTable, (table) => {
		table.increments("id").primary();
		table.integer("proxy_host_id").unsigned().nullable().references("id").inTable("proxy_host");
		// A nullable host column cannot participate in a portable unique constraint. The key keeps
		// the global and per-host buckets distinct on SQLite, MariaDB and PostgreSQL.
		table.string("bucket_key", 32).notNullable();
		table.string("bucket_start", 30).notNullable();
		table.integer("request_count").unsigned().notNullable().defaultTo(0);
		table.bigInteger("bytes_sent").unsigned().notNullable().defaultTo(0);
		table.integer("status_code_2xx").unsigned().notNullable().defaultTo(0);
		table.integer("status_code_3xx").unsigned().notNullable().defaultTo(0);
		table.integer("status_code_4xx").unsigned().notNullable().defaultTo(0);
		table.integer("status_code_5xx").unsigned().notNullable().defaultTo(0);
		table.bigInteger("duration_sum").unsigned().notNullable().defaultTo(0);
		table.integer("duration_count").unsigned().notNullable().defaultTo(0);
		table.bigInteger("rolled_up_at").notNullable().defaultTo(0);

		table.unique(["bucket_key", "bucket_start"], hourlyUniqueIndex);
		table.index(["bucket_start"], hourlyBucketIndex);
		table.index(["proxy_host_id", "bucket_start"], hourlyHostIndex);
	});
};

const createRollupStateTable = async (knex) => {
	if (await knex.schema.hasTable(rollupStateTable)) return;

	await knex.schema.createTable(rollupStateTable, (table) => {
		table.increments("id").primary();
		table.string("name", 32).notNullable().unique();
		table.string("coverage_start", 30).nullable();
		table.string("watermark", 30).nullable();
		table.bigInteger("last_run_at").notNullable().defaultTo(0);
		table.bigInteger("updated_at").notNullable().defaultTo(0);
	});
};

export const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	await createHourlyTable(knex);
	await createRollupStateTable(knex);

	// Raw-detail retention previously deleted on an unindexed column. The rollup also reads the
	// earliest remaining row, so a dedicated time index keeps both operations bounded.
	if ((await knex.schema.hasTable(detailTable)) && !(await hasIndex(knex, detailTable, detailTimeIndex))) {
		await knex.schema.alterTable(detailTable, (table) => {
			table.index(["time"], detailTimeIndex);
		});
	}

	logger.info(`[${migrateName}] Hourly analytics rollup tables created.`);
};

export const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	if (await knex.schema.hasTable(detailTable)) {
		if (await hasIndex(knex, detailTable, detailTimeIndex)) {
			await knex.schema.alterTable(detailTable, (table) => {
				table.dropIndex(["time"], detailTimeIndex);
			});
		}
	}

	await knex.schema.dropTableIfExists(rollupStateTable);
	await knex.schema.dropTableIfExists(hourlyTable);
};
