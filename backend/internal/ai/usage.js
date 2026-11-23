/**
 * Database-backed AI token accounting.
 *
 * The daily counter lives in `ai_token_usage` so it survives restarts and is
 * shared by every worker that uses the same database. The table is created by
 * a migration in production and lazily on first use in tests or during an
 * upgrade window, where the migration may not have run yet.
 */
import getDatabase from "../../db.js";

const dayKey = () => new Date().toISOString().slice(0, 10);
const bucketUser = (userId) => Number(userId) || 0;
let tableReady = null;

const ensureTable = async () => {
	if (tableReady) return tableReady;
	tableReady = (async () => {
		const database = getDatabase();
		if (await database.schema.hasTable("ai_token_usage")) return;
		await database.schema.createTable("ai_token_usage", (table) => {
			table.increments("id").primary();
			table.string("day", 10).notNullable().index();
			table.integer("user_id").notNullable().defaultTo(0);
			table.bigInteger("tokens").notNullable().defaultTo(0);
			table.unique(["day", "user_id"]);
		});
	})();
	try {
		await tableReady;
	} catch (error) {
		tableReady = null;
		throw error;
	}
	return tableReady;
};

/**
 * @param {number|string} userId
 * @returns {Promise<number>} Tokens consumed today by this user
 */
export const getDailyTokenUsage = async (userId) => {
	await ensureTable();
	const row = await getDatabase()("ai_token_usage")
		.where({ day: dayKey(), user_id: bucketUser(userId) })
		.first();
	return Number(row?.tokens) || 0;
};

/**
 * @param {number|string} userId
 * @param {number} tokens
 * @returns {Promise<number>} Tokens consumed today by this user after the update
 */
export const addDailyTokenUsage = async (userId, tokens) => {
	const amount = Math.floor(Number(tokens));
	if (!Number.isFinite(amount) || amount <= 0) return getDailyTokenUsage(userId);
	await ensureTable();
	const database = getDatabase();
	const day = dayKey();
	const user = bucketUser(userId);

	await database.transaction(async (trx) => {
		const client = trx.client.config.client;
		if (["better-sqlite3", "sqlite3", "pg"].includes(client)) {
			await trx("ai_token_usage")
				.insert({ day, user_id: user, tokens: amount })
				.onConflict(["day", "user_id"])
				.merge({ tokens: trx.raw("?? + ?", ["tokens", amount]) });
			return;
		}
		await trx.raw("INSERT INTO ?? (??, ??, ??) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE ?? = ?? + ?", [
			"ai_token_usage",
			"day",
			"user_id",
			"tokens",
			day,
			user,
			amount,
			"tokens",
			"tokens",
			amount,
		]);
	});

	return getDailyTokenUsage(userId);
};

/**
 * Drops every counter. Used by tests and when the configuration changes.
 */
export const resetDailyTokenUsage = async () => {
	await ensureTable();
	await getDatabase()("ai_token_usage").del();
};

/**
 * @param {Object} config
 * @returns {number} 0 means "no limit"
 */
export const getDailyBudget = (config) => {
	const budget = Number(config?.daily_token_budget);
	return Number.isFinite(budget) && budget > 0 ? Math.floor(budget) : 0;
};
