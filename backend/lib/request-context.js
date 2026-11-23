import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import { isIP } from "node:net";
import express from "express";

/**
 * Request-scoped audit context.
 *
 * Detection needs a correlation anchor that survives the whole async call chain
 * of a request: the audit insert happens several services deep and must not
 * require every one of the ~74 call sites to pass the request object down.
 * AsyncLocalStorage keeps the values available to `internal/audit-log.js`.
 */

const storage = new AsyncLocalStorage();

const MAX_IP_LENGTH = 45;
const MAX_USER_AGENT_LENGTH = 512;
const MAX_IDENTIFIER_LENGTH = 64;
// Reverse proxies and clients may supply an existing correlation id, but only a
// bounded, control-character-free value is accepted.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

const clean = (value, max) => {
	if (typeof value !== "string") {
		return null;
	}
	const result = value
		.replace(/\p{Cc}/gu, " ")
		.trim()
		.slice(0, max);
	return result || null;
};

/**
 * Resolve the client address for a request that arrived on a Unix socket.
 * Node reports no remote address for Unix sockets, so Express leaves `req.ip`
 * undefined even when Nginx supplies X-Real-IP or X-Forwarded-For. Rate
 * limiters and the audit context need a stable, validated address there.
 *
 * @param {import("express").Request} req
 * @returns {string | null}
 */
export const resolveClientIp = (req) => {
	if (typeof req?.ip === "string" && req.ip) return req.ip;
	if (typeof req?.socket?.remoteAddress === "string" && req.socket.remoteAddress) return req.socket.remoteAddress;
	const realIp = req?.headers?.["x-real-ip"];
	const forwardedFor = req?.headers?.["x-forwarded-for"];
	const supplied = Boolean(
		(typeof realIp === "string" && realIp.trim()) || (typeof forwardedFor === "string" && forwardedFor.trim()),
	);
	const candidate =
		typeof realIp === "string" && realIp.trim()
			? realIp.trim()
			: typeof forwardedFor === "string"
				? (forwardedFor.split(",")[0] || "").trim()
				: "";
	if (candidate) return isIP(candidate) ? candidate : null;
	// A Unix-socket peer has no remote address. Nginx supplies X-Real-IP for
	// proxied client traffic; a request without either is a local process such
	// as the updater health check, so loopback is the accurate address.
	if (!supplied && !req?.socket?.remoteAddress) return "127.0.0.1";
	return null;
};

const decodeClaims = (token) => {
	if (typeof token !== "string" || !token) {
		return null;
	}
	const parts = token.split(".");
	if (parts.length < 2 || !parts[1]) {
		return null;
	}
	try {
		return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
	} catch {
		return null;
	}
};

const requestToken = (req) => {
	const authorization = req.headers?.authorization;
	if (typeof authorization === "string") {
		const [scheme, token] = authorization.split(" ");
		if (/^Bearer$/i.test(scheme || "") && token) {
			return token;
		}
	}
	const cookie = req.headers?.cookie;
	if (typeof cookie === "string") {
		for (const part of cookie.split(";")) {
			const separator = part.indexOf("=");
			if (separator > 0 && part.slice(0, separator).trim() === "shieldpm_jwt") {
				return part.slice(separator + 1).trim();
			}
		}
	}
	return null;
};

/**
 * Session/family id is only a hint here. `internal/audit-log.js` prefers the
 * verified JWT claim from the loaded Access object and falls back to this value
 * for requests handled outside the regular JWT middleware.
 */
const sessionIdFromRequest = (req) => {
	const claims = decodeClaims(requestToken(req));
	if (!claims) {
		return null;
	}
	return clean(claims.sid ?? claims.session_id ?? claims.family_id, MAX_IDENTIFIER_LENGTH);
};

const requestIdFromRequest = (req) => {
	const header = req.headers?.["x-request-id"];
	const requested = Array.isArray(header) ? header[0] : header;
	if (typeof requested === "string" && REQUEST_ID_PATTERN.test(requested.trim())) {
		return requested.trim();
	}
	return crypto.randomUUID();
};

export const getRequestContext = () => storage.getStore() ?? null;

/**
 * Build the per-request context without touching the response.
 *
 * @param {import("express").Request} req
 */
export const buildRequestContext = (req) => ({
	requestId: requestIdFromRequest(req),
	ip: clean(resolveClientIp(req), MAX_IP_LENGTH),
	userAgent: clean(req.headers?.["user-agent"], MAX_USER_AGENT_LENGTH),
	sessionId: sessionIdFromRequest(req),
});

/**
 * Express middleware: make the request context available to every async
 * continuation of this request and echo the correlation id.
 *
 * @returns {import("express").RequestHandler}
 */
export const requestContext = () => (req, res, next) => {
	const context = buildRequestContext(req);
	res.setHeader("X-Request-ID", context.requestId);
	storage.run(context, next);
};

/**
 * Run a callback inside a synthetic request context. Used for system-initiated
 * flows that are not triggered by an HTTP request.
 *
 * @template T
 * @param {Partial<ReturnType<typeof buildRequestContext>>} context
 * @param {() => T} callback
 * @returns {T}
 */
export const runWithRequestContext = (context, callback) =>
	storage.run(
		{
			requestId: null,
			ip: null,
			userAgent: null,
			sessionId: null,
			...context,
		},
		callback,
	);
