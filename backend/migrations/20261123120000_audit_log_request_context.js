import { migrate as logger } from "../logger.js";

const migrateName = "audit_log_request_context";

const columns = ["ip", "user_agent", "session_id", "request_id", "outcome", "actor_user_id", "actor_type", "jti"];

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	// Every field is nullable so existing deployments keep writing legacy rows
	// and historical entries stay readable without a backfill.
	await knex.schema.table("audit_log", (table) => {
		table.string("ip", 45).nullable();
		table.string("user_agent", 512).nullable();
		table.string("session_id", 64).nullable();
		table.string("request_id", 64).nullable();
		table.string("outcome", 16).nullable();
		table.integer("actor_user_id").unsigned().nullable();
		table.string("actor_type", 16).nullable();
		table.string("jti", 64).nullable();
		table.index(["created_on"], "idx_audit_log_created_on");
		table.index(["request_id"], "idx_audit_log_request_id");
	});
};

const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex.schema.table("audit_log", (table) => {
		table.dropIndex(["created_on"], "idx_audit_log_created_on");
		table.dropIndex(["request_id"], "idx_audit_log_request_id");
	});
	for (const column of columns) {
		await knex.schema.table("audit_log", (table) => {
			table.dropColumn(column);
		});
	}
};

export { down, up };
