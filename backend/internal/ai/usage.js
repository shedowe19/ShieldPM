/**
 * Process-local AI token accounting.
 *
 * The budget is intentionally simple: a per-day counter per user. It is
 * process local, which matches the single-process deployment of ShieldPM and
 * keeps every provider call cheap to account. A restart resets the counters;
 * the hard stop is a cost guard, not billing.
 */

const buckets = new Map();

const dayKey = () => new Date().toISOString().slice(0, 10);

const bucketKey = (userId) => `${dayKey()}:${userId ?? 0}`;

/**
 * @param {number|string} userId
 * @returns {number} Tokens consumed today by this user
 */
export const getDailyTokenUsage = (userId) => buckets.get(bucketKey(userId)) || 0;

/**
 * @param {number|string} userId
 * @param {number} tokens
 */
export const addDailyTokenUsage = (userId, tokens) => {
	const amount = Number(tokens);
	if (!Number.isFinite(amount) || amount <= 0) return getDailyTokenUsage(userId);
	const key = bucketKey(userId);
	const next = (buckets.get(key) || 0) + Math.floor(amount);
	buckets.set(key, next);
	return next;
};

/**
 * Drops every counter. Used by tests and when the configuration changes.
 */
export const resetDailyTokenUsage = () => buckets.clear();

/**
 * @param {Object} config
 * @returns {number} 0 means "no limit"
 */
export const getDailyBudget = (config) => {
	const budget = Number(config?.daily_token_budget);
	return Number.isFinite(budget) && budget > 0 ? Math.floor(budget) : 0;
};
