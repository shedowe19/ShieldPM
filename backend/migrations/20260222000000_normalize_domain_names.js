import { migrate as logger } from "../logger.js";

const migrateName = "normalize_domain_names";
const tableName = "host_domain";
const foreignKeyName = "host_domain_proxy_host_id_foreign";
const domainIndexName = "host_domain_domain_name_index";
const chunkSize = 100;
const requiredColumns = ["id", "proxy_host_id", "domain_name", "created_on", "modified_on"];

const domainKey = (proxyHostId, domainName) => JSON.stringify([String(proxyHostId), domainName.toLowerCase()]);

const resultRows = (result) => {
	const rows = result?.rows ?? (Array.isArray(result?.[0]) ? result[0] : result);
	return Array.isArray(rows) ? rows : [];
};

const hasProxyHostForeignKey = async (knex) => {
	const client = String(knex.client.config.client);
	if (client.includes("sqlite")) {
		const rows = resultRows(await knex.raw('PRAGMA foreign_key_list("host_domain")'));
		return rows.some(
			(row) =>
				row.from === "proxy_host_id" &&
				row.table === "proxy_host" &&
				row.to === "id" &&
				String(row.on_delete).toUpperCase() === "CASCADE" &&
				String(row.on_update).toUpperCase() === "CASCADE",
		);
	}

	if (client.includes("mysql")) {
		const rows = resultRows(
			await knex.raw(
				`SELECT constraint_name FROM information_schema.table_constraints
				 WHERE constraint_schema = DATABASE() AND table_name = ?
				   AND constraint_name = ? AND constraint_type = 'FOREIGN KEY'`,
				[tableName, foreignKeyName],
			),
		);
		return rows.length > 0;
	}

	if (client === "pg" || client.includes("postgres")) {
		const rows = resultRows(
			await knex.raw(
				`SELECT constraint_name FROM information_schema.table_constraints
				 WHERE table_schema = current_schema() AND table_name = ?
				   AND constraint_name = ? AND constraint_type = 'FOREIGN KEY'`,
				[tableName, foreignKeyName],
			),
		);
		return rows.length > 0;
	}

	throw new Error(`Unsupported database client for ${tableName} migration: ${client}`);
};

const hasDomainIndex = async (knex) => {
	const client = String(knex.client.config.client);
	let rows;
	if (client.includes("sqlite")) {
		rows = resultRows(await knex.raw('PRAGMA index_list("host_domain")'));
		return rows.some((row) => row.name === domainIndexName);
	}

	if (client.includes("mysql")) {
		rows = resultRows(
			await knex.raw(
				`SELECT index_name FROM information_schema.statistics
				 WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
				[tableName, domainIndexName],
			),
		);
		return rows.length > 0;
	}

	if (client === "pg" || client.includes("postgres")) {
		rows = resultRows(
			await knex.raw(
				`SELECT indexname FROM pg_indexes
				 WHERE schemaname = current_schema() AND tablename = ? AND indexname = ?`,
				[tableName, domainIndexName],
			),
		);
		return rows.length > 0;
	}

	throw new Error(`Unsupported database client for ${tableName} migration: ${client}`);
};

const assertExpectedColumns = async (knex) => {
	const columns = await knex(tableName).columnInfo();
	const missing = requiredColumns.filter((column) => !(column in columns));
	if (missing.length > 0) {
		throw new Error(`Existing ${tableName} table is missing required columns: ${missing.join(", ")}`);
	}
};

const deleteDuplicateDomains = async (knex, rows) => {
	const seen = new Set();
	const duplicateIds = [];

	for (const row of rows) {
		const key = domainKey(row.proxy_host_id, row.domain_name);
		if (seen.has(key)) duplicateIds.push(row.id);
		else seen.add(key);
	}

	for (let i = 0; i < duplicateIds.length; i += chunkSize) {
		await knex(tableName)
			.whereIn("id", duplicateIds.slice(i, i + chunkSize))
			.delete();
	}

	return { duplicateCount: duplicateIds.length, keys: seen };
};

/**
 * Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up... Preparing host_domain table`);

	if (!(await knex.schema.hasTable(tableName))) {
		await knex.schema.createTable(tableName, (table) => {
			table.increments("id").primary();
			table.integer("proxy_host_id").unsigned().notNullable();
			table.string("domain_name").notNullable();
			table.dateTime("created_on").notNullable().defaultTo(knex.fn.now());
			table.dateTime("modified_on").notNullable().defaultTo(knex.fn.now());

			// Foreign key to map cascade deletes
			table
				.foreign("proxy_host_id", foreignKeyName)
				.references("id")
				.inTable("proxy_host")
				.onDelete("CASCADE")
				.onUpdate("CASCADE");

			// Core B-Tree search index exactly for the LIKE search optimization
			table.index(["domain_name"], domainIndexName);
		});
		logger.info(`[${migrateName}] Created host_domain table.`);
	} else {
		await assertExpectedColumns(knex);
		logger.info(`[${migrateName}] host_domain table already exists; resuming legacy data migration.`);
	}

	if (!(await hasProxyHostForeignKey(knex))) {
		await knex.schema.alterTable(tableName, (table) => {
			table
				.foreign("proxy_host_id", foreignKeyName)
				.references("id")
				.inTable("proxy_host")
				.onDelete("CASCADE")
				.onUpdate("CASCADE");
		});
		logger.info(`[${migrateName}] Restored missing proxy-host foreign key.`);
	}

	if (!(await hasDomainIndex(knex))) {
		await knex.schema.alterTable(tableName, (table) => {
			table.index(["domain_name"], domainIndexName);
		});
		logger.info(`[${migrateName}] Restored missing domain-name index.`);
	}

	logger.info(`[${migrateName}] Migrating legacy JSON array data...`);

	// Migrate existing data from proxy_host JSON array to normalized structure
	const rows = await knex("proxy_host").select("id", "domain_names");

	const candidates = new Map();
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
					const key = domainKey(row.id, domain);
					if (!candidates.has(key)) {
						candidates.set(key, {
							proxy_host_id: row.id,
							domain_name: domain,
						});
					}
				}
			}
		}
	}

	const existingRows = await knex(tableName).select("id", "proxy_host_id", "domain_name").orderBy("id", "asc");
	const { duplicateCount, keys: existingKeys } = await deleteDuplicateDomains(knex, existingRows);
	if (duplicateCount > 0) {
		logger.info(`[${migrateName}] Removed ${duplicateCount} duplicate rows left by an interrupted import.`);
	}

	const inserts = [...candidates.entries()].filter(([key]) => !existingKeys.has(key)).map(([, insert]) => insert);

	if (inserts.length > 0) {
		// Use batch mapping to prevent SQlite SQLITE_MAX_VARIABLE_NUMBER constraint (999 chunks)
		for (let i = 0; i < inserts.length; i += chunkSize) {
			const chunk = inserts.slice(i, i + chunkSize);
			await knex(tableName).insert(chunk);
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
	await knex.schema.dropTableIfExists(tableName);
	logger.info(`[${migrateName}] Dropped host_domain table.`);
};

export { down, up };
