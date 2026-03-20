import User from "../../models/user.js";

const LOGIN_ATTEMPT_TABLE = "login_attempts";
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPT_BLOCK_MS = 15 * 60 * 1000;
let loginAttemptTableInitPromise = null;

const getLoginAttemptKnex = () => User.knex();

const normalizeLoginIdentifier = (body) => {
	if (!body || typeof body !== "object") return null;
	const candidates = [body.identity, body.email, body.username];
	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.trim()) {
			return candidate.trim().toLowerCase();
		}
	}
	return null;
};

const ensureLoginAttemptStorage = async () => {
	if (!loginAttemptTableInitPromise) {
		loginAttemptTableInitPromise = (async () => {
			const knex = getLoginAttemptKnex();
			const hasTable = await knex.schema.hasTable(LOGIN_ATTEMPT_TABLE);
			if (!hasTable) {
				await knex.schema.createTable(LOGIN_ATTEMPT_TABLE, (table) => {
					table.increments("id").primary();
					table.string("scope", 32).notNullable();
					table.string("identifier", 255).notNullable();
					table.integer("attempt_count").notNullable().defaultTo(0);
					table.bigInteger("first_attempt_at").notNullable();
					table.bigInteger("last_attempt_at").notNullable();
					table.bigInteger("blocked_until").notNullable().defaultTo(0);
					table.unique(["scope", "identifier"]);
					table.index(["last_attempt_at"]);
					table.index(["blocked_until"]);
				});
			}
		})();
	}
	return loginAttemptTableInitPromise;
};

const cleanupExpiredLoginAttempts = async (now = Date.now()) => {
	await ensureLoginAttemptStorage();
	await getLoginAttemptKnex()(LOGIN_ATTEMPT_TABLE)
		.where("last_attempt_at", "<", now - LOGIN_ATTEMPT_WINDOW_MS)
		.andWhere("blocked_until", "<", now)
		.delete();
};

const getLoginAttemptState = async (scope, identifier, now = Date.now()) => {
	await ensureLoginAttemptStorage();
	const record = await getLoginAttemptKnex()(LOGIN_ATTEMPT_TABLE).where({ scope, identifier }).first();
	if (!record) return { count: 0, blockedUntil: 0 };
	if (record.blocked_until > now) return { count: record.attempt_count, blockedUntil: record.blocked_until };
	if (now - record.last_attempt_at >= LOGIN_ATTEMPT_WINDOW_MS) {
		await getLoginAttemptKnex()(LOGIN_ATTEMPT_TABLE).where({ scope, identifier }).delete();
		return { count: 0, blockedUntil: 0 };
	}
	return { count: record.attempt_count, blockedUntil: 0 };
};

const registerFailedLoginAttempt = async (scope, identifier, now = Date.now()) => {
	await ensureLoginAttemptStorage();
	const knex = getLoginAttemptKnex();
	await knex(LOGIN_ATTEMPT_TABLE)
		.insert({ scope, identifier, attempt_count: 1, first_attempt_at: now, last_attempt_at: now, blocked_until: 0 })
		.onConflict(["scope", "identifier"])
		.merge({
			attempt_count: knex.raw(
				`CASE WHEN (? - ${LOGIN_ATTEMPT_TABLE}.last_attempt_at) >= ? THEN 1 ELSE ${LOGIN_ATTEMPT_TABLE}.attempt_count + 1 END`,
				[now, LOGIN_ATTEMPT_WINDOW_MS],
			),
			first_attempt_at: knex.raw(
				`CASE WHEN (? - ${LOGIN_ATTEMPT_TABLE}.last_attempt_at) >= ? THEN ? ELSE ${LOGIN_ATTEMPT_TABLE}.first_attempt_at END`,
				[now, LOGIN_ATTEMPT_WINDOW_MS, now],
			),
			last_attempt_at: now,
			blocked_until: knex.raw(
				`CASE WHEN (CASE WHEN (? - ${LOGIN_ATTEMPT_TABLE}.last_attempt_at) >= ? THEN 1 ELSE ${LOGIN_ATTEMPT_TABLE}.attempt_count + 1 END) >= ? THEN ? + ? ELSE 0 END`,
				[now, LOGIN_ATTEMPT_WINDOW_MS, LOGIN_ATTEMPT_LIMIT, now, LOGIN_ATTEMPT_BLOCK_MS],
			),
		});
};

const clearLoginAttempts = async (identifiers) => {
	await ensureLoginAttemptStorage();
	const filters = identifiers.filter((entry) => entry.identifier);
	if (filters.length === 0) return;
	await getLoginAttemptKnex()(LOGIN_ATTEMPT_TABLE)
		.where((builder) => {
			for (const filter of filters) builder.orWhere({ scope: filter.scope, identifier: filter.identifier });
		})
		.delete();
};

export {
	clearLoginAttempts,
	cleanupExpiredLoginAttempts,
	ensureLoginAttemptStorage,
	getLoginAttemptState,
	registerFailedLoginAttempt,
	normalizeLoginIdentifier,
};
