import dayjs from "dayjs";
import { global as logger } from "../logger.js";
import AuthSession from "../models/auth-session.js";

const RETENTION_DAYS = 7;
const INTERVAL_MS = 60 * 60 * 1000;
let timer;
let pending;

/**
 * Remove only tokens expired beyond the recovery window. Unexpired rotated
 * predecessors must remain available for replay detection, even in live families.
 * @param {{batchSize?: number, maxBatches?: number, now?: Date}} options
 * @returns {Promise<number>}
 */
const prune = (options = {}) => {
	if (pending) return pending;
	const batchSize = Math.min(1000, Math.max(1, options.batchSize || 1000));
	const maxBatches = Math.min(10, Math.max(1, options.maxBatches || 10));
	const cutoff = dayjs(options.now).subtract(RETENTION_DAYS, "day").format("YYYY-MM-DD HH:mm:ss");
	pending = (async () => {
		let removed = 0;
		for (let batch = 0; batch < maxBatches; batch++) {
			const result = await AuthSession.transaction(async (trx) => {
				const rows = await AuthSession.query(trx)
					.select("id")
					.where("expires_at", "<", cutoff)
					.orderBy("expires_at")
					.orderBy("id")
					.limit(batchSize);
				if (!rows.length) return { removed: 0, selected: 0 };
				const ids = rows.map((row) => row.id);
				// Explicitly preserve references on SQLite installations that did not
				// enable foreign_keys; PostgreSQL/MySQL have the same SET NULL contract.
				await AuthSession.query(trx).whereIn("parent_session_id", ids).patch({ parent_session_id: null });
				await AuthSession.query(trx)
					.whereIn("replaced_by_session_id", ids)
					.patch({ replaced_by_session_id: null });
				const deleted = await AuthSession.query(trx)
					.whereIn("id", ids)
					.where("expires_at", "<", cutoff)
					.delete();
				return { removed: deleted, selected: rows.length };
			});
			removed += result.removed;
			if (result.selected < batchSize) break;
		}
		return removed;
	})().finally(() => {
		pending = undefined;
	});
	return pending;
};

const initTimer = async () => {
	clearInterval(timer);
	timer = setInterval(() => {
		prune().catch((error) => logger.error(`Refresh-session cleanup failed: ${error.message}`));
	}, INTERVAL_MS);
	timer.unref?.();
	await prune().catch((error) => logger.error(`Refresh-session cleanup failed: ${error.message}`));
};

const stop = async () => {
	clearInterval(timer);
	timer = undefined;
	await pending;
};

export default { prune, initTimer, stop, RETENTION_DAYS };
