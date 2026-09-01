const epochMillisecondsDefault = (knex) => {
	switch (knex.client.dialect) {
		case "mysql":
			return knex.raw("(CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 AS UNSIGNED))");
		case "postgresql":
			return knex.raw("(FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::BIGINT)");
		case "sqlite3":
			return knex.raw(
				"(CAST(strftime('%s', 'now') AS INTEGER) * 1000 + CAST(substr(strftime('%f', 'now'), 4, 3) AS INTEGER))",
			);
		default:
			throw new Error(`Unsupported database dialect: ${knex.client.dialect}`);
	}
};

export const up = (knex) => {
	const createdAtDefault = epochMillisecondsDefault(knex);
	return knex.schema.createTable("analytics_logs", (table) => {
		table.increments("id").primary();
		table.integer("host_id").unsigned().notNullable();
		table.string("time").notNullable(); // ISO string or timestamp
		table.string("method");
		table.string("path");
		table.integer("status");
		table.integer("bytes");
		table.string("ip");
		table.string("country_code");
		table.string("referer");
		table.string("user_agent");
		table.integer("duration"); // ms
		table.bigInteger("created_at").defaultTo(createdAtDefault);

		table.index(["host_id", "time"]);
		// Index for cleanup
		table.index("created_at");
	});
};

export const down = (knex) => knex.schema.dropTableIfExists("analytics_logs");
