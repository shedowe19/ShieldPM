export const up = function (knex) {
    return knex.schema.table("proxy_host", function (table) {
        table.text("php_override_ini").defaultTo(null);
    });
};

export const down = function (knex) {
    return knex.schema.table("proxy_host", function (table) {
        table.dropColumn("php_override_ini");
    });
};
