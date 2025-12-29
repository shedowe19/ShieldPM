export const up = (knex) =>
    knex.schema.alterTable("analytics_logs", (table) => {
        table.text("path").alter();
        table.text("referer").alter();
        table.text("user_agent").alter();
    });

export const down = (knex) =>
    knex.schema.alterTable("analytics_logs", (table) => {
        table.string("path").alter();
        table.string("referer").alter();
        table.string("user_agent").alter();
    });
