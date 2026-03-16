import { migrate as logger } from "../logger.js";

const migrateName = "add_auth_sessions";
const tableName = "auth_sessions";

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	await knex.schema.createTable(tableName, (table) => {
		table.increments("id").primary();
		table.integer("user_id").unsigned().notNullable().references("id").inTable("user").onDelete("CASCADE");
		table.string("family_id", 36).notNullable();
		table.integer("parent_session_id").unsigned().nullable();
		table.string("token_hash", 64).notNullable();
		table.string("jti", 36).notNullable();
		table.json("scope").notNullable();
		table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
		table.dateTime("expires_at").notNullable();
		table.dateTime("last_used_at").nullable();
		table.dateTime("rotated_at").nullable();
		table.dateTime("revoked_at").nullable();
		table.string("revoked_reason", 255).nullable();
		table.integer("replaced_by_session_id").unsigned().nullable();
		table.string("created_ip", 45).nullable();
		table.string("created_user_agent", 512).nullable();

		table.unique(["token_hash"], "uq_auth_sessions_token_hash");
		table.unique(["jti"], "uq_auth_sessions_jti");
		table.index(["user_id"], "idx_auth_sessions_user_id");
		table.index(["family_id"], "idx_auth_sessions_family_id");
		table.index(["expires_at"], "idx_auth_sessions_expires_at");
		table.index(["revoked_at"], "idx_auth_sessions_revoked_at");
		table.index(["user_id", "family_id"], "idx_auth_sessions_user_family");
	});

	await knex.schema.alterTable(tableName, (table) => {
		table
			.foreign("parent_session_id", "fk_auth_sessions_parent_session")
			.references("id")
			.inTable(tableName)
			.onDelete("SET NULL");
		table
			.foreign("replaced_by_session_id", "fk_auth_sessions_replaced_by_session")
			.references("id")
			.inTable(tableName)
			.onDelete("SET NULL");
	});

	logger.info(`[${migrateName}] Table '${tableName}' created`);
};

const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	await knex.schema.dropTable(tableName);

	logger.info(`[${migrateName}] Table '${tableName}' dropped`);
};

export { up, down };
