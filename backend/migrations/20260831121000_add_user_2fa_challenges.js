import crypto from "node:crypto";
import { migrate as logger } from "../logger.js";

const migrateName = "add_user_2fa_challenges";
const challengeTable = "user_2fa_challenges";
const methodTable = "user_2fa";

const hashCredentialId = (credentialId) => crypto.createHash("sha256").update(credentialId, "utf8").digest("hex");
const hashYubikeyId = (deviceId) => hashCredentialId(`yubikey\0${deviceId}`);

const isExistingIndexError = (error) => {
	const code = error?.code || error?.nativeError?.code;
	return (
		code === "ER_DUP_KEYNAME" ||
		code === "42P07" ||
		code === "42710" ||
		(code === "SQLITE_ERROR" && /already exists/i.test(error?.message || ""))
	);
};

const isMissingIndexError = (error) => {
	const code = error?.code || error?.nativeError?.code;
	return (
		code === "ER_CANT_DROP_FIELD_OR_KEY" ||
		code === "42704" ||
		(code === "SQLITE_ERROR" && /no such index|not found/i.test(error?.message || ""))
	);
};

const ensureColumn = async (knex, tableName, columnName, define) => {
	if (await knex.schema.hasColumn(tableName, columnName)) return;
	await knex.schema.alterTable(tableName, (table) => define(table));
};

const ensureIndex = async (knex, tableName, columns, indexName, unique = false) => {
	try {
		await knex.schema.alterTable(tableName, (table) => {
			if (unique) table.unique(columns, indexName);
			else table.index(columns, indexName);
		});
	} catch (error) {
		if (!isExistingIndexError(error)) throw error;
	}
};

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	await ensureColumn(knex, methodTable, "credential_id_hash", (table) =>
		table.string("credential_id_hash", 64).nullable(),
	);

	const credentials = await knex(methodTable)
		.select("id", "secret")
		.select("type")
		.whereIn("type", ["passkey", "yubikey"])
		.whereNotNull("secret")
		.whereNull("credential_id_hash");
	for (const credential of credentials) {
		const value = String(credential.secret);
		const hash = credential.type === "yubikey" ? hashYubikeyId(value) : hashCredentialId(value);
		await knex(methodTable).where({ id: credential.id }).update({ credential_id_hash: hash });
	}

	const duplicateCredentials = await knex(methodTable)
		.select("credential_id_hash")
		.whereNotNull("credential_id_hash")
		.groupBy("credential_id_hash")
		.havingRaw("COUNT(*) > 1");
	if (duplicateCredentials.length > 0) {
		throw new Error(
			"Duplicate passkey or YubiKey credentials exist. Remove duplicate credential rows before retrying this migration.",
		);
	}
	await ensureIndex(knex, methodTable, ["credential_id_hash"], "uq_user_2fa_credential_hash", true);

	if (!(await knex.schema.hasTable(challengeTable))) {
		await knex.schema.createTable(challengeTable, (table) => {
			table.increments("id").primary();
			table.integer("user_id").unsigned().notNullable().references("id").inTable("user").onDelete("CASCADE");
			table.string("challenge_id_hash", 64).notNullable();
			table.string("type", 64).notNullable();
			table.string("purpose", 64).notNullable();
			table.string("session_binding", 64).notNullable();
			// Set only for login/step-up flows whose parent credential must be
			// single-use. NULL deliberately permits multiple enrollment attempts.
			table.string("flow_key", 64).nullable();
			table.text("challenge").notNullable();
			table.string("rp_id", 255).nullable();
			table.string("origin", 2048).nullable();
			table.dateTime("expires_at").notNullable();
			table.dateTime("consumed_at").nullable();
			table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
		});
	} else {
		if (!(await knex.schema.hasColumn(challengeTable, "id"))) {
			throw new Error(`Partially created ${challengeTable} table is missing its primary key`);
		}
		await ensureColumn(knex, challengeTable, "user_id", (table) =>
			table.integer("user_id").unsigned().notNullable().references("id").inTable("user").onDelete("CASCADE"),
		);
		await ensureColumn(knex, challengeTable, "challenge_id_hash", (table) =>
			table.string("challenge_id_hash", 64).notNullable(),
		);
		await ensureColumn(knex, challengeTable, "type", (table) => table.string("type", 64).notNullable());
		await ensureColumn(knex, challengeTable, "purpose", (table) => table.string("purpose", 64).notNullable());
		await ensureColumn(knex, challengeTable, "session_binding", (table) =>
			table.string("session_binding", 64).notNullable(),
		);
		await ensureColumn(knex, challengeTable, "flow_key", (table) => table.string("flow_key", 64).nullable());
		await ensureColumn(knex, challengeTable, "challenge", (table) => table.text("challenge").notNullable());
		await ensureColumn(knex, challengeTable, "rp_id", (table) => table.string("rp_id", 255).nullable());
		await ensureColumn(knex, challengeTable, "origin", (table) => table.string("origin", 2048).nullable());
		await ensureColumn(knex, challengeTable, "expires_at", (table) => table.dateTime("expires_at").notNullable());
		await ensureColumn(knex, challengeTable, "consumed_at", (table) => table.dateTime("consumed_at").nullable());
		await ensureColumn(knex, challengeTable, "created_at", (table) =>
			table.dateTime("created_at").notNullable().defaultTo(knex.fn.now()),
		);
	}
	await ensureIndex(knex, challengeTable, ["challenge_id_hash"], "uq_2fa_challenge_id", true);
	await ensureIndex(knex, challengeTable, ["flow_key"], "uq_2fa_challenge_flow", true);
	await ensureIndex(
		knex,
		challengeTable,
		["user_id", "type", "purpose", "session_binding"],
		"idx_2fa_challenge_lookup",
	);
	await ensureIndex(knex, challengeTable, ["expires_at"], "idx_2fa_challenge_expiry");

	logger.info(`[${migrateName}] MFA challenge storage and passkey credential uniqueness created`);
};

const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex.schema.dropTableIfExists(challengeTable);
	if (await knex.schema.hasColumn(methodTable, "credential_id_hash")) {
		try {
			await knex.schema.alterTable(methodTable, (table) => {
				table.dropUnique(["credential_id_hash"], "uq_user_2fa_credential_hash");
			});
		} catch (error) {
			if (!isMissingIndexError(error)) throw error;
		}
		await knex.schema.alterTable(methodTable, (table) => {
			table.dropColumn("credential_id_hash");
		});
	}
	logger.info(`[${migrateName}] MFA challenge storage removed`);
};

export { down, up };
