export const up = (knex) =>
    knex.schema.createTable("analytics_logs", (table) => {
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
        table.bigInteger("created_at").defaultTo(knex.fn.now());

        table.index(["host_id", "time"]);
        // Index for cleanup
        table.index("created_at");
    });

export const down = (knex) => knex.schema.dropTableIfExists("analytics_logs");
