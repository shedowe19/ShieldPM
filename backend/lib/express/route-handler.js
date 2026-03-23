/**
 * Wraps an async route handler with standard error handling.
 * Catches rejected promises and forwards to Express error middleware.
 *
 * @param {Function} fn - Async route handler (req, res, next) => Promise
 * @returns {Function} Express middleware
 */
export const asyncHandler = (fn) => (req, res, next) => {
	Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Standard error response middleware for Express.
 * Reads `err.status`/`err.statusCode` and `err.public` to build a
 * consistent JSON error envelope.
 *
 * @param {Error & {status?: number, statusCode?: number, public?: boolean}} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export const errorHandler = (err, _req, res, _next) => {
	const status = err.status || err.statusCode || 500;
	const message = err.public ? err.message : "Internal Server Error";
	res.status(status).json({ error: { code: status, message } });
};
