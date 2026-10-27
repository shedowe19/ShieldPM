export const up = async (knex) => {
	// InnoDB already creates these indexes for the existing foreign keys.
	if (knex.client.dialect === "mysql") return;
	await knex.schema.table("auth_sessions", (table) => {
		table.index(["parent_session_id"], "idx_auth_sessions_parent");
		table.index(["replaced_by_session_id"], "idx_auth_sessions_replacement");
	});
};

export const down = async (knex) => {
	if (knex.client.dialect === "mysql") return;
	await knex.schema.table("auth_sessions", (table) => {
		table.dropIndex(["parent_session_id"], "idx_auth_sessions_parent");
		table.dropIndex(["replaced_by_session_id"], "idx_auth_sessions_replacement");
	});
};
