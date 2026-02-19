export const up = function (knex) {
  return knex.schema.table("proxy_host", function (table) {
    table.integer("anubis_enabled").notNull().defaultTo(0);
  });
};

export const down = function (knex) {
  return knex.schema.table("proxy_host", function (table) {
    table.dropColumn("anubis_enabled");
  });
};
