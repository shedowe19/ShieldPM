export function up(knex) {
    return knex.schema.table("access_list", (table) => {
        table.boolean("mtls_enabled").notNullable().defaultTo(false);
        table.text("mtls_certificate").notNullable().defaultTo("");
    });
}

export function down(knex) {
    return knex.schema.table("access_list", (table) => {
        table.dropColumn("mtls_enabled");
        table.dropColumn("mtls_certificate");
    });
}
