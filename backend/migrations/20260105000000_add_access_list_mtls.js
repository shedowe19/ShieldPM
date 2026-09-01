import { migrate as logger } from "../logger.js";

const migrateName = "20260105000000_add_access_list_mtls";

const decodeMeta = (value) => {
	if (typeof value === "string") {
		try {
			return JSON.parse(value);
		} catch (_error) {
			return null;
		}
	}

	return value && typeof value === "object" && !Array.isArray(value) ? value : null;
};

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	// Check if columns exist before adding to be idempotent
	const hasEnabled = await knex.schema.hasColumn("access_list", "mtls_enabled");
	const hasCert = await knex.schema.hasColumn("access_list", "mtls_certificate");

	if (!hasEnabled || !hasCert) {
		await knex.schema.table("access_list", (table) => {
			if (!hasEnabled) {
				table.boolean("mtls_enabled").notNullable().defaultTo(false);
			}
			if (!hasCert) {
				table.text("mtls_certificate").notNullable().defaultTo("");
			}
		});
	}

	// Migrate existing data from meta if any
	const rows = await knex("access_list").select("id", "meta");
	for (const row of rows) {
		const meta = decodeMeta(row.meta);
		const hasEnabled =
			typeof meta?.mtls_enabled === "boolean" || meta?.mtls_enabled === 0 || meta?.mtls_enabled === 1;
		const hasCertificate = typeof meta?.mtls_certificate === "string";

		if (meta && (hasEnabled || hasCertificate)) {
			const cleanedMeta = { ...meta };
			if (hasEnabled) delete cleanedMeta.mtls_enabled;
			if (hasCertificate) delete cleanedMeta.mtls_certificate;
			await knex("access_list")
				.where("id", row.id)
				.update({
					mtls_enabled: hasEnabled ? !!meta.mtls_enabled : false,
					mtls_certificate: hasCertificate ? meta.mtls_certificate : "",
					meta: JSON.stringify(cleanedMeta),
				});
		}
	}

	logger.info(`[${migrateName}] access_list Table altered`);
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = async (_knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	// These columns may already belong to the historical 20260103000000
	// migration. Its file was later restored as a dummy, so there is no
	// reliable schema marker that distinguishes legacy columns from columns
	// created here. Keep them rather than deleting state this migration may
	// not own.
	logger.info(`[${migrateName}] Rollback skipped to preserve potentially pre-existing mTLS columns`);
};

export { down, up };
