import { migrate as logger } from "../logger.js";

const migrateName = "fix_analytic_count_aggregation_key";
const tableName = "analytic_count";
const aggregationKeyColumn = "aggregation_key";
const aggregationTimestampColumn = "aggregation_timestamp";
const aggregationGenerationColumn = "aggregation_generation";
const aggregationColumns = [aggregationKeyColumn, aggregationTimestampColumn, aggregationGenerationColumn];
const uniqueIndexName = "analytic_count_aggregation_key_timestamp_generation_unique";
const globalAggregationKey = "global";
const currentAggregationGeneration = "live";

const aggregationKeyExpression = (knex) => {
	const client = knex.client.config.client;
	const bindings = ["proxy_host_id", "proxy_host_id", globalAggregationKey, "host:", "proxy_host_id"];

	if (["mysql", "mysql2"].includes(client)) {
		return knex.raw("CASE WHEN ?? IS NULL OR ?? = 0 THEN ? ELSE CONCAT(?, ??) END", bindings);
	}

	return knex.raw("CASE WHEN ?? IS NULL OR ?? = 0 THEN ? ELSE ? || CAST(?? AS TEXT) END", bindings);
};

const legacyAggregationGenerationExpression = (knex) => {
	const client = knex.client.config.client;

	if (["mysql", "mysql2"].includes(client)) {
		return knex.raw("CONCAT(?, ??)", ["legacy:", "id"]);
	}

	return knex.raw("? || CAST(?? AS TEXT)", ["legacy:", "id"]);
};

const uniqueIndexExists = async (knex) => {
	const client = knex.client.config.client;

	if (client === "better-sqlite3" || client === "sqlite3") {
		const indexes = await knex.raw(`PRAGMA index_list('${tableName}')`);
		return indexes.some((index) => index.name === uniqueIndexName);
	}

	if (["mysql", "mysql2"].includes(client)) {
		const result = await knex.raw("SHOW INDEX FROM ?? WHERE Key_name = ?", [tableName, uniqueIndexName]);
		const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
		return Array.isArray(rows) && rows.length > 0;
	}

	if (client === "pg") {
		const result = await knex.raw(
			"SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = ? AND indexname = ?",
			[tableName, uniqueIndexName],
		);
		return result.rows.length > 0;
	}

	return true;
};

export const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	if (!(await knex.schema.hasTable(tableName))) {
		logger.warn(`[${migrateName}] ${tableName} does not exist; skipping.`);
		return;
	}

	const missingColumns = [];
	if (!(await knex.schema.hasColumn(tableName, aggregationKeyColumn))) {
		missingColumns.push(aggregationKeyColumn);
	}
	if (!(await knex.schema.hasColumn(tableName, aggregationTimestampColumn))) {
		missingColumns.push(aggregationTimestampColumn);
	}
	if (!(await knex.schema.hasColumn(tableName, aggregationGenerationColumn))) {
		missingColumns.push(aggregationGenerationColumn);
	}

	if (missingColumns.length > 0) {
		await knex.schema.table(tableName, (table) => {
			if (missingColumns.includes(aggregationKeyColumn)) {
				table.string(aggregationKeyColumn, 32).notNullable().defaultTo(globalAggregationKey);
			}
			if (missingColumns.includes(aggregationTimestampColumn)) {
				table.string(aggregationTimestampColumn, 30).notNullable().defaultTo("");
			}
			if (missingColumns.includes(aggregationGenerationColumn)) {
				table.string(aggregationGenerationColumn, 32).notNullable().defaultTo(currentAggregationGeneration);
			}
		});
	}

	// Preserve every legacy row and counter byte-for-byte. Distinct legacy:<id> values keep all historical rows separate
	// from the live aggregation namespace without JS-side numeric aggregation or destructive deduplication.
	await knex(tableName).update({
		[aggregationKeyColumn]: aggregationKeyExpression(knex),
		[aggregationTimestampColumn]: knex.raw("??", ["timestamp"]),
		[aggregationGenerationColumn]: legacyAggregationGenerationExpression(knex),
	});

	await knex.schema.table(tableName, (table) => {
		table.unique(aggregationColumns, uniqueIndexName);
	});

	logger.info(`[${migrateName}] Added bounded, versioned analytics aggregation keys.`);
};

export const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	if (!(await knex.schema.hasTable(tableName))) {
		return;
	}

	const existingColumns = [];
	for (const column of aggregationColumns) {
		if (await knex.schema.hasColumn(tableName, column)) {
			existingColumns.push(column);
		}
	}
	if (existingColumns.length === 0) {
		return;
	}

	if (await uniqueIndexExists(knex)) {
		await knex.schema.table(tableName, (table) => {
			table.dropUnique(aggregationColumns, uniqueIndexName);
		});
	}

	await knex.schema.table(tableName, (table) => {
		for (const column of existingColumns) {
			table.dropColumn(column);
		}
	});
};
