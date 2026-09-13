import { PGlite } from "@electric-sql/pglite";
import knex from "knex";
import ClientPg from "knex/lib/dialects/postgres/index.js";

/** Run the real PostgreSQL engine in-process while retaining Knex's PG dialect. */
export const createPostgres = async () => {
	const postgres = await PGlite.create();
	class EmbeddedPostgresClient extends ClientPg {
		async acquireRawConnection() {
			return postgres;
		}
		async destroyRawConnection() {}
		async _query(connection, query) {
			const result = await connection.query(query.sql, query.bindings || []);
			query.response = {
				...result,
				rowCount: result.affectedRows,
				command: query.sql.trim().split(/\s+/)[0].toUpperCase(),
			};
			return query;
		}
	}
	const database = knex({ client: EmbeddedPostgresClient, connection: {}, pool: { min: 0, max: 1 } });
	database.client.config.client = "pg";
	return {
		database,
		async close() {
			await database.destroy();
			await postgres.close();
		},
	};
};
