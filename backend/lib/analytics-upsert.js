const counterColumns = [
	"status_code_2xx",
	"status_code_3xx",
	"status_code_4xx",
	"status_code_5xx",
	"bytes_sent",
	"request_count",
];
const conflictColumns = ["aggregation_key", "aggregation_timestamp", "aggregation_generation"];

/**
 * Add a bounded batch atomically, including repeated keys within the same input batch.
 * @param {Object} model
 * @param {Array<Record<string, any>>} rows
 * @param {number} chunkSize
 * @returns {Promise<void>}
 */
export const upsertAnalyticsRows = async (model, rows, chunkSize = 250) => {
	if (!rows.length) return;
	const uniqueRows = new Map();
	for (const row of rows) {
		const key = JSON.stringify(conflictColumns.map((column) => row[column]));
		const existing = uniqueRows.get(key);
		if (existing) {
			for (const column of counterColumns) existing[column] += row[column];
		} else {
			uniqueRows.set(key, { ...row });
		}
	}
	const batch = [...uniqueRows.values()];
	const table = model.tableName || "analytic_count";
	await model.transaction(async (trx) => {
		const dialect = trx.client.config.client;
		const isMysql = ["mysql", "mysql2"].includes(dialect);
		const merge = Object.fromEntries(
			counterColumns.map((column) => [
				column,
				trx.raw(isMysql ? "coalesce(??, 0) + values(??)" : "coalesce(??, 0) + excluded.??", [
					`${table}.${column}`,
					column,
				]),
			]),
		);
		for (let offset = 0; offset < batch.length; offset += chunkSize) {
			await trx
				.table(table)
				.insert(batch.slice(offset, offset + chunkSize))
				.onConflict(conflictColumns)
				.merge(merge);
		}
	});
};
