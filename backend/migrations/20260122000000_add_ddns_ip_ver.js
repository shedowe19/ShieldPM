/**
 * @param   {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    return knex.schema.table("ddns_provider", (table) => {
        table.string("ip_ver").notNullable().defaultTo("dual");
    });
}

/**
 * @param   {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    return knex.schema.table("ddns_provider", (table) => {
        table.dropColumn("ip_ver");
    });
}
