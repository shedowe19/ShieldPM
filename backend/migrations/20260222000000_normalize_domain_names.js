import { migrate as logger } from "../logger.js";

const migrateName = "normalize_domain_names";

/**
 * Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up... Creating host_domain table`);

	await knex.schema.createTable("host_domain", (table) => {
		table.increments("id").primary();
		table.integer("proxy_host_id").unsigned().notNullable();
		table.string("domain_name").notNullable();
		table.string("created_on").notNullable().defaultTo(knex.fn.now());
		table.string("modified_on").notNullable().defaultTo(knex.fn.now());

		// Foreign key to map cascade deletes
		table.foreign("proxy_host_id").references("id").inTable("proxy_host").onDelete("CASCADE").onUpdate("CASCADE");

		// Core B-Tree search index exactly for the LIKE search optimization
		table.index(["domain_name"]);
	});

	logger.info(`[${migrateName}] Created host_domain table. Migrating legacy JSON array data...`);

	// Migrate existing data from proxy_host JSON array to normalized structure
	const rows = await knex("proxy_host").select("id", "domain_names");

	const inserts = [];
	for (const row of rows) {
		let domainNamesArr = [];
		try {
			if (typeof row.domain_names === "string") {
				domainNamesArr = JSON.parse(row.domain_names);
			} else if (Array.isArray(row.domain_names)) {
				domainNamesArr = row.domain_names;
			}
		} catch (err) {
			logger.warn(`[${migrateName}] Failed to parse domain_names for proxy host ID ${row.id}: ${err.message}`);
			continue; // skip corrupt data
		}

		if (Array.isArray(domainNamesArr)) {
			for (const domain of domainNamesArr) {
				if (typeof domain === "string" && domain.length > 0) {
					inserts.push({
						proxy_host_id: row.id,
						domain_name: domain,
					});
				}
			}
		}
	}

	if (inserts.length > 0) {
		// Use batch mapping to prevent SQlite SQLITE_MAX_VARIABLE_NUMBER constraint (999 chunks)
		const chunkSize = 100;
		for (let i = 0; i < inserts.length; i += chunkSize) {
			const chunk = inserts.slice(i, i + chunkSize);
			await knex("host_domain").insert(chunk);
		}
		logger.info(`[${migrateName}] Successfully migrated ${inserts.length} domains to host_domain table.`);
	} else {
		logger.info(`[${migrateName}] No legacy domains found to migrate.`);
	}

	// Note: We purposely leave the JSON array 'domain_names' column in proxy_host
	// so the rollback down() function can simply drop the new table if needed.
	// The objection models will ignore it if we overwrite it locally, ensuring a
	// safe migration path until we fully deprecate it in a future major version.
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down... Dropping host_domain table`);
	await knex.schema.dropTableIfExists("host_domain");
	logger.info(`[${migrateName}] Dropped host_domain table.`);
};

export { down, up };
