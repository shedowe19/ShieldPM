import { createHash } from "node:crypto";

const counterColumns = [
	"status_code_2xx",
	"status_code_3xx",
	"status_code_4xx",
	"status_code_5xx",
	"bytes_sent",
	"request_count",
];
const conflictColumns = ["aggregation_key", "aggregation_timestamp", "aggregation_generation"];
const detailConflictColumns = ["event_key"];

/**
 * Build the stable identity of one access-log event.
 * Replays of the same physical log line produce the same key, so repeated imports stay idempotent.
 * @param {Object} event
 * @returns {string}
 */
export const buildAnalyticsEventKey = (event) =>
	createHash("sha256")
		.update(
			[
				event.time || "",
				String(event.hostId ?? 0),
				event.ip || "",
				event.method || "",
				event.path || "",
				String(event.status ?? 0),
				String(event.bytes ?? 0),
				String(event.duration ?? 0),
				event.requestId || "",
			].join("\u0000"),
		)
		.digest("hex");

/**
 * Insert detail rows exactly once. Existing event keys are filtered in the same transaction and
 * the unique index closes the remaining race. Returns only the rows this call actually inserts.
 * @param {Object} model
 * @param {Array<Record<string, any>>} rows
 * @param {number} chunkSize
 * @param {import("knex").Knex.Transaction|null} trx
 * @returns {Promise<Array<Record<string, any>>>}
 */
export const insertAnalyticsLogs = async (model, rows, chunkSize = 250, trx = null) => {
	if (!rows.length) return [];

	const uniqueRows = new Map();
	for (const row of rows) {
		if (!row.event_key || uniqueRows.has(row.event_key)) continue;
		uniqueRows.set(row.event_key, row);
	}
	const batch = [...uniqueRows.values()];
	if (!batch.length) return [];

	const table = model.tableName || "analytics_logs";
	const run = async (tx) => {
		const existingKeys = new Set();
		for (let offset = 0; offset < batch.length; offset += chunkSize) {
			const keys = batch.slice(offset, offset + chunkSize).map((row) => row.event_key);
			const found = await tx.table(table).whereIn("event_key", keys).pluck("event_key");
			for (const key of found) existingKeys.add(key);
		}

		const freshRows = batch.filter((row) => !existingKeys.has(row.event_key));
		const isMysql = ["mysql", "mysql2"].includes(tx.client.config.client);
		for (let offset = 0; offset < freshRows.length; offset += chunkSize) {
			const chunk = freshRows.slice(offset, offset + chunkSize);
			// MySQL's INSERT IGNORE also swallows data errors. The pre-read already removed
			// committed duplicates, so a plain insert keeps real failures visible.
			if (isMysql) {
				await tx.table(table).insert(chunk);
			} else {
				await tx.table(table).insert(chunk).onConflict(detailConflictColumns).ignore();
			}
		}
		return freshRows;
	};

	if (trx) return run(trx);
	return model.transaction(run);
};

/**
 * Add a bounded batch atomically, including repeated keys within the same input batch.
 * @param {Object} model
 * @param {Array<Record<string, any>>} rows
 * @param {number} chunkSize
 * @param {import("knex").Knex.Transaction|null} trx
 * @returns {Promise<void>}
 */
export const upsertAnalyticsRows = async (model, rows, chunkSize = 250, trx = null) => {
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
	const run = async (tx) => {
		const dialect = tx.client.config.client;
		const isMysql = ["mysql", "mysql2"].includes(dialect);
		const merge = Object.fromEntries(
			counterColumns.map((column) => [
				column,
				tx.raw(isMysql ? "coalesce(??, 0) + values(??)" : "coalesce(??, 0) + excluded.??", [
					`${table}.${column}`,
					column,
				]),
			]),
		);
		for (let offset = 0; offset < batch.length; offset += chunkSize) {
			await tx
				.table(table)
				.insert(batch.slice(offset, offset + chunkSize))
				.onConflict(conflictColumns)
				.merge(merge);
		}
	};

	if (trx) {
		await run(trx);
		return;
	}
	await model.transaction(run);
};
