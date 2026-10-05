/**
 * Preserve imported numeric IDs without allowing later PostgreSQL inserts to reuse them.
 * The table lock precedes the write and blocks normal inserts until its sequence is advanced.
 * @template T
 * @param {import("objection").ModelClass<import("objection").Model>} model
 * @param {(transaction?: import("knex").Knex.Transaction) => Promise<T>} write
 * @returns {Promise<T>}
 */
export const withImportedIdSequence = async (model, write) => {
	const database = model.knex?.();
	if (!["pg", "postgres", "postgresql"].includes(database?.client?.config?.client)) return write();
	const idColumn = model.idColumn;
	if (typeof idColumn !== "string") return write();
	const tableName = model.tableName;
	const result = await database.raw("SELECT pg_get_serial_sequence(?, ?) AS sequence_name", [
		database.ref(tableName).toString(),
		idColumn,
	]);
	const sequence = result.rows[0]?.sequence_name;
	if (!sequence) return write();
	return database.transaction(async (transaction) => {
		await transaction.raw("LOCK TABLE ?? IN SHARE ROW EXCLUSIVE MODE", [tableName]);
		const written = await write(transaction);
		const { rows } = await transaction.raw(
			"SELECT last_value, is_called, (SELECT MAX(??) FROM ??) AS maximum_id FROM ??",
			[idColumn, tableName, sequence],
		);
		const state = rows[0];
		if (
			state.maximum_id !== null &&
			(BigInt(state.maximum_id) > BigInt(state.last_value) ||
				(BigInt(state.maximum_id) === BigInt(state.last_value) && !state.is_called))
		) {
			await transaction.raw("SELECT setval(?::regclass, ?, true)", [sequence, state.maximum_id]);
		}
		return written;
	});
};
