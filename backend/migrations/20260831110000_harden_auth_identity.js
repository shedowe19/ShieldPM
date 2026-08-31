import { migrate as logger } from "../logger.js";

const migrateName = "harden_auth_identity";

const isExistingIndexError = (error) => {
	const code = error?.code || error?.nativeError?.code;
	return (
		code === "ER_DUP_KEYNAME" ||
		code === "42P07" ||
		code === "42710" ||
		(code === "SQLITE_ERROR" && /already exists/i.test(error?.message || ""))
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

const requireIdColumn = async (knex, tableName) => {
	if (!(await knex.schema.hasColumn(tableName, "id"))) {
		throw new Error(`Partially created ${tableName} table is missing its primary key; restore it before retrying`);
	}
};

const addAuthSessionColumns = async (knex) => {
	await ensureColumn(knex, "auth_sessions", "auth_time", (table) => table.dateTime("auth_time").nullable());
	await ensureColumn(knex, "auth_sessions", "authentication_methods", (table) =>
		table.json("authentication_methods").nullable(),
	);
	await ensureColumn(knex, "auth_sessions", "actor_user_id", (table) =>
		table.integer("actor_user_id").unsigned().nullable(),
	);
	await ensureColumn(knex, "auth_sessions", "actor_session_id", (table) =>
		table.integer("actor_session_id").unsigned().nullable(),
	);
	await ensureColumn(knex, "auth_sessions", "impersonated_at", (table) =>
		table.dateTime("impersonated_at").nullable(),
	);
};

const ensureOidcIdentityTable = async (knex) => {
	if (!(await knex.schema.hasTable("oidc_identity"))) {
		await knex.schema.createTable("oidc_identity", (table) => {
			table.increments("id").primary();
			table.integer("user_id").unsigned().notNullable().references("id").inTable("user").onDelete("CASCADE");
			table.string("binding_hash", 64).notNullable();
			table.string("issuer_hash", 64).notNullable();
			table.string("subject_hash", 64).notNullable();
			table.string("issuer", 512).notNullable();
			table.string("subject", 512).notNullable();
			table.string("email_at_link", 255).nullable();
			table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
			table.dateTime("last_login_at").nullable();
		});
	} else {
		await requireIdColumn(knex, "oidc_identity");
		await ensureColumn(knex, "oidc_identity", "user_id", (table) =>
			table.integer("user_id").unsigned().notNullable().references("id").inTable("user").onDelete("CASCADE"),
		);
		await ensureColumn(knex, "oidc_identity", "binding_hash", (table) =>
			table.string("binding_hash", 64).notNullable(),
		);
		await ensureColumn(knex, "oidc_identity", "issuer_hash", (table) =>
			table.string("issuer_hash", 64).notNullable(),
		);
		await ensureColumn(knex, "oidc_identity", "subject_hash", (table) =>
			table.string("subject_hash", 64).notNullable(),
		);
		await ensureColumn(knex, "oidc_identity", "issuer", (table) => table.string("issuer", 512).notNullable());
		await ensureColumn(knex, "oidc_identity", "subject", (table) => table.string("subject", 512).notNullable());
		await ensureColumn(knex, "oidc_identity", "email_at_link", (table) =>
			table.string("email_at_link", 255).nullable(),
		);
		await ensureColumn(knex, "oidc_identity", "created_at", (table) =>
			table.dateTime("created_at").notNullable().defaultTo(knex.fn.now()),
		);
		await ensureColumn(knex, "oidc_identity", "last_login_at", (table) =>
			table.dateTime("last_login_at").nullable(),
		);
	}
	await ensureIndex(knex, "oidc_identity", ["binding_hash"], "uq_oidc_identity_binding_hash", true);
	await ensureIndex(knex, "oidc_identity", ["issuer_hash", "subject_hash"], "uq_oidc_identity_issuer_subject", true);
	await ensureIndex(knex, "oidc_identity", ["user_id"], "idx_oidc_identity_user_id");
	await ensureIndex(knex, "oidc_identity", ["issuer_hash"], "idx_oidc_identity_issuer_hash");
};

const ensureOidcFlowTable = async (knex) => {
	if (!(await knex.schema.hasTable("oidc_flow"))) {
		await knex.schema.createTable("oidc_flow", (table) => {
			table.increments("id").primary();
			table.string("flow_hash", 64).notNullable();
			table.string("state_hash", 64).notNullable();
			table.string("nonce", 255).notNullable();
			table.string("pkce_verifier", 255).notNullable();
			table.string("purpose", 16).notNullable();
			table.integer("user_id").unsigned().nullable().references("id").inTable("user").onDelete("CASCADE");
			table.string("redirect_uri", 2048).notNullable();
			table.string("issuer_hash", 64).notNullable();
			table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
			table.dateTime("expires_at").notNullable();
			table.dateTime("consumed_at").nullable();
		});
	} else {
		await requireIdColumn(knex, "oidc_flow");
		await ensureColumn(knex, "oidc_flow", "flow_hash", (table) => table.string("flow_hash", 64).notNullable());
		await ensureColumn(knex, "oidc_flow", "state_hash", (table) => table.string("state_hash", 64).notNullable());
		await ensureColumn(knex, "oidc_flow", "nonce", (table) => table.string("nonce", 255).notNullable());
		await ensureColumn(knex, "oidc_flow", "pkce_verifier", (table) =>
			table.string("pkce_verifier", 255).notNullable(),
		);
		await ensureColumn(knex, "oidc_flow", "purpose", (table) => table.string("purpose", 16).notNullable());
		await ensureColumn(knex, "oidc_flow", "user_id", (table) =>
			table.integer("user_id").unsigned().nullable().references("id").inTable("user").onDelete("CASCADE"),
		);
		await ensureColumn(knex, "oidc_flow", "redirect_uri", (table) =>
			table.string("redirect_uri", 2048).notNullable(),
		);
		await ensureColumn(knex, "oidc_flow", "issuer_hash", (table) => table.string("issuer_hash", 64).notNullable());
		await ensureColumn(knex, "oidc_flow", "created_at", (table) =>
			table.dateTime("created_at").notNullable().defaultTo(knex.fn.now()),
		);
		await ensureColumn(knex, "oidc_flow", "expires_at", (table) => table.dateTime("expires_at").notNullable());
		await ensureColumn(knex, "oidc_flow", "consumed_at", (table) => table.dateTime("consumed_at").nullable());
	}
	await ensureIndex(knex, "oidc_flow", ["flow_hash"], "uq_oidc_flow_hash", true);
	await ensureIndex(knex, "oidc_flow", ["state_hash"], "uq_oidc_state_hash", true);
	await ensureIndex(knex, "oidc_flow", ["expires_at"], "idx_oidc_flow_expires_at");
};

const ensureInitialSetupClaimTable = async (knex) => {
	if (!(await knex.schema.hasTable("initial_setup_claim"))) {
		await knex.schema.createTable("initial_setup_claim", (table) => {
			table.integer("id").primary();
			table.string("token_hash", 64).notNullable();
			table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
			table.dateTime("consumed_at").nullable();
			table.integer("claimed_user_id").unsigned().nullable();
			table.string("claimed_ip", 45).nullable();
		});
	} else {
		await requireIdColumn(knex, "initial_setup_claim");
		await ensureColumn(knex, "initial_setup_claim", "token_hash", (table) =>
			table.string("token_hash", 64).notNullable(),
		);
		await ensureColumn(knex, "initial_setup_claim", "created_at", (table) =>
			table.dateTime("created_at").notNullable().defaultTo(knex.fn.now()),
		);
		await ensureColumn(knex, "initial_setup_claim", "consumed_at", (table) =>
			table.dateTime("consumed_at").nullable(),
		);
		await ensureColumn(knex, "initial_setup_claim", "claimed_user_id", (table) =>
			table.integer("claimed_user_id").unsigned().nullable(),
		);
		await ensureColumn(knex, "initial_setup_claim", "claimed_ip", (table) =>
			table.string("claimed_ip", 45).nullable(),
		);
	}
	await ensureIndex(knex, "initial_setup_claim", ["token_hash"], "uq_initial_setup_claim_token_hash", true);
};

const ensureLoginAttemptTable = async (knex) => {
	if (!(await knex.schema.hasTable("login_attempts"))) {
		await knex.schema.createTable("login_attempts", (table) => {
			table.increments("id").primary();
			table.string("scope", 32).notNullable();
			table.string("identifier", 255).notNullable();
			table.integer("attempt_count").notNullable().defaultTo(0);
			table.bigInteger("first_attempt_at").notNullable();
			table.bigInteger("last_attempt_at").notNullable();
			table.bigInteger("blocked_until").notNullable().defaultTo(0);
		});
	} else {
		await requireIdColumn(knex, "login_attempts");
		await ensureColumn(knex, "login_attempts", "scope", (table) => table.string("scope", 32).notNullable());
		await ensureColumn(knex, "login_attempts", "identifier", (table) =>
			table.string("identifier", 255).notNullable(),
		);
		await ensureColumn(knex, "login_attempts", "attempt_count", (table) =>
			table.integer("attempt_count").notNullable().defaultTo(0),
		);
		await ensureColumn(knex, "login_attempts", "first_attempt_at", (table) =>
			table.bigInteger("first_attempt_at").notNullable(),
		);
		await ensureColumn(knex, "login_attempts", "last_attempt_at", (table) =>
			table.bigInteger("last_attempt_at").notNullable(),
		);
		await ensureColumn(knex, "login_attempts", "blocked_until", (table) =>
			table.bigInteger("blocked_until").notNullable().defaultTo(0),
		);
	}
	await ensureIndex(knex, "login_attempts", ["scope", "identifier"], "uq_login_attempt_scope_identifier", true);
	await ensureIndex(knex, "login_attempts", ["last_attempt_at"], "idx_login_attempt_last_at");
	await ensureIndex(knex, "login_attempts", ["blocked_until"], "idx_login_attempt_blocked_until");
};

const ensureAuthChallengeTable = async (knex) => {
	if (!(await knex.schema.hasTable("auth_challenge"))) {
		await knex.schema.createTable("auth_challenge", (table) => {
			table.increments("id").primary();
			table.integer("user_id").unsigned().notNullable().references("id").inTable("user").onDelete("CASCADE");
			table.string("challenge_hash", 64).notNullable();
			table.string("purpose", 32).notNullable();
			table.json("meta").notNullable();
			table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
			table.dateTime("expires_at").notNullable();
			table.dateTime("consumed_at").nullable();
		});
	} else {
		await requireIdColumn(knex, "auth_challenge");
		await ensureColumn(knex, "auth_challenge", "user_id", (table) =>
			table.integer("user_id").unsigned().notNullable().references("id").inTable("user").onDelete("CASCADE"),
		);
		await ensureColumn(knex, "auth_challenge", "challenge_hash", (table) =>
			table.string("challenge_hash", 64).notNullable(),
		);
		await ensureColumn(knex, "auth_challenge", "purpose", (table) => table.string("purpose", 32).notNullable());
		await ensureColumn(knex, "auth_challenge", "meta", (table) => table.json("meta").notNullable());
		await ensureColumn(knex, "auth_challenge", "created_at", (table) =>
			table.dateTime("created_at").notNullable().defaultTo(knex.fn.now()),
		);
		await ensureColumn(knex, "auth_challenge", "expires_at", (table) => table.dateTime("expires_at").notNullable());
		await ensureColumn(knex, "auth_challenge", "consumed_at", (table) => table.dateTime("consumed_at").nullable());
	}
	await ensureIndex(knex, "auth_challenge", ["challenge_hash"], "uq_auth_challenge_hash", true);
	await ensureIndex(knex, "auth_challenge", ["user_id", "purpose"], "idx_auth_challenge_user_purpose");
	await ensureIndex(knex, "auth_challenge", ["expires_at"], "idx_auth_challenge_expires_at");
};

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	if (!(await knex.schema.hasTable("auth_sessions"))) {
		throw new Error("auth_sessions must exist before the auth hardening migration can run");
	}

	await addAuthSessionColumns(knex);
	await ensureOidcIdentityTable(knex);
	await ensureOidcFlowTable(knex);
	await ensureInitialSetupClaimTable(knex);
	await ensureLoginAttemptTable(knex);
	await ensureAuthChallengeTable(knex);
	logger.info(`[${migrateName}] Auth and identity schema hardened`);
};

const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex.schema.dropTableIfExists("auth_challenge");
	await knex.schema.dropTableIfExists("login_attempts");
	await knex.schema.dropTableIfExists("initial_setup_claim");
	await knex.schema.dropTableIfExists("oidc_flow");
	await knex.schema.dropTableIfExists("oidc_identity");

	for (const column of [
		"impersonated_at",
		"actor_session_id",
		"actor_user_id",
		"authentication_methods",
		"auth_time",
	]) {
		if (await knex.schema.hasColumn("auth_sessions", column)) {
			await knex.schema.alterTable("auth_sessions", (table) => table.dropColumn(column));
		}
	}
};

export { down, up };
