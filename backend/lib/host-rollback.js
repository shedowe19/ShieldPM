import { global as logger } from "../logger.js";
import errs from "./error.js";

const errorNames = new Set([
	"Error",
	...Object.keys(errs),
	"DBError",
	"ConstraintViolationError",
	"ForeignKeyViolationError",
	"NotNullViolationError",
	"UniqueViolationError",
	"CheckViolationError",
	"DataError",
]);
const errorCodes = new Set([
	"ER_CHECKREAD",
	"ER_LOCK_DEADLOCK",
	"ER_LOCK_WAIT_TIMEOUT",
	"ER_TRUNCATED_WRONG_VALUE",
	"ER_TRUNCATED_WRONG_VALUE_FOR_FIELD",
	"ER_BAD_FIELD_ERROR",
	"ER_DATA_TOO_LONG",
	"ER_BAD_NULL_ERROR",
	"ER_DUP_ENTRY",
	"ER_NO_REFERENCED_ROW_2",
	"ER_ROW_IS_REFERENCED_2",
	"ER_CHECK_CONSTRAINT_VIOLATED",
	"ER_CONSTRAINT_FAILED",
	"ER_PARSE_ERROR",
	"ER_WRONG_VALUE_COUNT_ON_ROW",
	"ER_NO_SUCH_TABLE",
	"ER_QUERY_INTERRUPTED",
	"SQLITE_BUSY",
	"SQLITE_LOCKED",
	"SQLITE_CONSTRAINT",
	"SQLITE_CONSTRAINT_CHECK",
	"SQLITE_CONSTRAINT_FOREIGNKEY",
	"SQLITE_CONSTRAINT_NOTNULL",
	"SQLITE_CONSTRAINT_PRIMARYKEY",
	"SQLITE_CONSTRAINT_UNIQUE",
	"22001",
	"22007",
	"22P02",
	"23502",
	"23503",
	"23505",
	"23514",
	"40001",
	"40P01",
	"55P03",
	"ECONNREFUSED",
	"ECONNRESET",
	"ETIMEDOUT",
	"ENOENT",
	"EACCES",
	"EPERM",
	"EIO",
]);
const operations = new Set(["update", "delete", "enable", "disable", "restore"]);

/** Summarize fixed error identifiers without copying free-form messages, SQL or captured host values. */
const summarizeError = (error) => {
	/** @type {{name: string, code?: string, errno?: number, sqlState?: string}} */
	const summary = { name: "Error" };
	const pending = [error];
	const seen = new Set();
	while (pending.length && seen.size < 8) {
		const candidate = pending.shift();
		if (!candidate || typeof candidate !== "object" || seen.has(candidate)) continue;
		seen.add(candidate);
		if (seen.size === 1 && errorNames.has(candidate.name)) summary.name = candidate.name;
		if (!summary.code && errorCodes.has(candidate.code)) summary.code = candidate.code;
		if (
			summary.errno === undefined &&
			Number.isInteger(candidate.errno) &&
			candidate.errno >= 0 &&
			candidate.errno <= 65535
		)
			summary.errno = candidate.errno;
		const state = candidate.sqlState ?? candidate.sqlstate;
		if (!summary.sqlState && typeof state === "string" && /^[0-9A-Z]{5}$/.test(state)) summary.sqlState = state;
		pending.push(candidate.nativeError, candidate.cause, candidate.previous);
	}
	return summary;
};

/**
 * Compensate a failed host change, preserving its original error unless compensation also fails.
 * @param {any} original
 * @param {{hostId: number, operation: string, restore: () => Promise<unknown>, reload: () => Promise<unknown>}} options
 * @returns {Promise<never>}
 */
export async function rethrowAfterHostRollback(original, options) {
	let phase = "restore";
	try {
		await options.restore();
		phase = "reload";
		await options.reload();
	} catch (rollback) {
		const diagnostic = {
			host_id: Number.isSafeInteger(options.hostId) && options.hostId > 0 ? options.hostId : null,
			operation: operations.has(options.operation) ? options.operation : "unknown",
			phase,
			original: summarizeError(original),
			rollback: summarizeError(rollback),
		};
		const failure = new errs.InternalError(
			"Host change failed; rollback failed and the host state requires verification",
		);
		Object.defineProperties(failure, {
			previous: { value: original, enumerable: false },
			cause: { value: rollback, enumerable: false },
		});
		try {
			logger.error(`[Host rollback] ${JSON.stringify(diagnostic)}`);
		} catch {
			// A failed log sink must not replace either host failure.
		}
		throw failure;
	}
	throw original;
}
