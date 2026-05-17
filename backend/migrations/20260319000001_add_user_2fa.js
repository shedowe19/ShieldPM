import { migrate as logger } from "../logger.js";

const migrateName = "add_user_2fa";
const twoFaTable = "user_2fa";
const backupCodesTable = "user_2fa_backup_codes";

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	// Store 2FA methods per user: TOTP, YubiKey, Passkey, Duo
	await knex.schema.createTable(twoFaTable, (table) => {
		table.increments("id").primary();
		table.integer("user_id").unsigned().notNullable().references("id").inTable("user").onDelete("CASCADE");
		// type: 'totp' | 'yubikey' | 'passkey' | 'duo'
		table.string("type", 32).notNullable();
		// Human-readable label (e.g. device name)
		table.string("label", 255).nullable();
		// Encrypted TOTP secret / YubiKey device ID / Duo OIDC state / passkey credential ID
		table.text("secret").nullable();
		// For passkeys: CBOR-encoded public key
		table.text("public_key").nullable();
		// For passkeys: signature counter to detect clones
		table.integer("counter").defaultTo(0);
		// For passkeys: comma-separated transports
		table.string("transports", 255).nullable();
		// Flexible metadata (Duo config, TOTP algorithm, etc.)
		table.json("meta").nullable();
		// Whether the user has completed the verification step for this method
		table.integer("is_verified").notNullable().defaultTo(0);
		table.integer("is_deleted").notNullable().defaultTo(0);
		table.dateTime("created_on").notNullable();
		table.dateTime("modified_on").notNullable();

		table.index(["user_id"], "idx_user_2fa_user_id");
		table.index(["user_id", "type", "is_deleted"], "idx_user_2fa_user_type");
	});

	// One-time backup codes for recovery when primary 2FA is unavailable
	await knex.schema.createTable(backupCodesTable, (table) => {
		table.increments("id").primary();
		table.integer("user_id").unsigned().notNullable().references("id").inTable("user").onDelete("CASCADE");
		// bcrypt hash of the code
		table.string("code_hash", 80).notNullable();
		table.dateTime("used_at").nullable();
		table.dateTime("created_on").notNullable();

		table.index(["user_id"], "idx_user_2fa_backup_codes_user_id");
	});

	logger.info(`[${migrateName}] Tables '${twoFaTable}' and '${backupCodesTable}' created`);
};

const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex.schema.dropTableIfExists(backupCodesTable);
	await knex.schema.dropTableIfExists(twoFaTable);
	logger.info(`[${migrateName}] Tables dropped`);
};

export { down, up };
