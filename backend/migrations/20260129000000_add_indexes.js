import { migrate as logger } from "../logger.js";

const migrateName = "20260129000000_add_indexes";

/**
 * Migrate Up
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.table("proxy_host", (table) => {
			table.index(["owner_user_id", "is_deleted"]);
			table.index("access_list_id");
			table.index("certificate_id");
		})
		.then(() => {
			return knex.schema.table("redirection_host", (table) => {
				table.index(["owner_user_id", "is_deleted"]);
				table.index("certificate_id");
			});
		})
		.then(() => {
			return knex.schema.table("dead_host", (table) => {
				table.index(["owner_user_id", "is_deleted"]);
				table.index("certificate_id");
			});
		})
		.then(() => {
			return knex.schema.table("stream", (table) => {
				table.index(["owner_user_id", "is_deleted"]);
			});
		})
		.then(() => {
			return knex.schema.table("access_list", (table) => {
				table.index(["owner_user_id", "is_deleted"]);
			});
		})
		.then(() => {
			return knex.schema.table("certificate", (table) => {
				table.index(["owner_user_id", "is_deleted"]);
			});
		})
		.then(() => {
			return knex.schema.table("audit_log", (table) => {
				table.index("user_id");
				table.index("object_type");
				table.index("object_id");
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] Indexes added`);
		});
};

/**
 * Migrate Down
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema
		.table("proxy_host", (table) => {
			table.dropIndex(["owner_user_id", "is_deleted"]);
			table.dropIndex("access_list_id");
			table.dropIndex("certificate_id");
		})
		.then(() => {
			return knex.schema.table("redirection_host", (table) => {
				table.dropIndex(["owner_user_id", "is_deleted"]);
				table.dropIndex("certificate_id");
			});
		})
		.then(() => {
			return knex.schema.table("dead_host", (table) => {
				table.dropIndex(["owner_user_id", "is_deleted"]);
				table.dropIndex("certificate_id");
			});
		})
		.then(() => {
			return knex.schema.table("stream", (table) => {
				table.dropIndex(["owner_user_id", "is_deleted"]);
			});
		})
		.then(() => {
			return knex.schema.table("access_list", (table) => {
				table.dropIndex(["owner_user_id", "is_deleted"]);
			});
		})
		.then(() => {
			return knex.schema.table("certificate", (table) => {
				table.dropIndex(["owner_user_id", "is_deleted"]);
			});
		})
		.then(() => {
			return knex.schema.table("audit_log", (table) => {
				table.dropIndex("user_id");
				table.dropIndex("object_type");
				table.dropIndex("object_id");
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] Indexes removed`);
		});
};

export { up, down };
