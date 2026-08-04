import { isPostgres } from "./config.js";

/**
 * Advances a PostgreSQL serial sequence after rows are restored with explicit IDs.
 * Knex/Objection preserve those IDs but PostgreSQL does not advance the backing sequence.
 *
 * @param {typeof import("objection").Model} modelClass
 * @returns {Promise<void>}
 */
const resetPostgresSequence = async (modelClass) => {
	if (!isPostgres()) return;

	const tableName = modelClass.tableName;
	await modelClass
		.knex()
		.raw(
			"SELECT setval(pg_get_serial_sequence(?, ?), COALESCE((SELECT MAX(??) FROM ??), 1), EXISTS (SELECT 1 FROM ??));",
			[tableName, "id", "id", tableName, tableName],
		);
};

export { resetPostgresSequence };
