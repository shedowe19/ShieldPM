/**
 * Migration: Add Service Icon fields to proxy_host
 * Adds support for automatic and custom service icons
 */

export function up(knex) {
	return knex.schema.alterTable("proxy_host", (table) => {
		// URL for custom icon (e.g., from Dashboard Icons CDN or user-provided)
		table.string("icon_url", 512).nullable();
		// Icon type: 'auto' (detect from port/hostname), 'custom' (use icon_url), 'none' (no icon)
		table.string("icon_type", 32).defaultTo("auto");
	});
}

export function down(knex) {
	return knex.schema.alterTable("proxy_host", (table) => {
		table.dropColumn("icon_url");
		table.dropColumn("icon_type");
	});
}
