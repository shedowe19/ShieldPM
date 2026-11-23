import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { getEncryptionKey } from "./config.js";

/** The Nginx-injected handoff marker is not a user session. */
const HANDOFF_CONTEXT = "shieldpm:terminal:v1";
const SESSION_CONTEXT = "shieldpm:terminal:v2";
export const TERMINAL_SESSION_TTL_MS = 5 * 60 * 1000;
const TOKEN_PATTERN = /^v2\.(\d{13})\.([a-f0-9]{32})\.([a-f0-9]{64})$/;
const MAX_TRACKED_TOKENS = 10_000;

/** nonce -> expiry. Tokens are single-use even inside their five-minute window. */
const consumedTokens = new Map();
const signingKey = () => Buffer.from(getEncryptionKey(), "hex");

const pruneConsumedTokens = (now) => {
	for (const [nonce, expires] of consumedTokens) {
		if (expires <= now) consumedTokens.delete(nonce);
	}
	if (consumedTokens.size > MAX_TRACKED_TOKENS) {
		// Map iteration is insertion-ordered; drop the oldest half.
		let drop = Math.ceil(consumedTokens.size / 2);
		for (const nonce of consumedTokens.keys()) {
			consumedTokens.delete(nonce);
			if (--drop <= 0) break;
		}
	}
};

const signature = (context, hostId, issuedAt, nonce) =>
	createHmac("sha256", signingKey())
		.update(`${context}:${Number(hostId)}:${issuedAt}:${nonce}`)
		.digest("hex");

const safeEqualHex = (left, right) => {
	if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
	return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
};

/** Bind the trusted Nginx terminal handoff to one host without exposing the signing key. */
export const getTerminalAccessToken = (hostId) =>
	createHmac("sha256", signingKey())
		.update(`${HANDOFF_CONTEXT}:${Number(hostId)}`)
		.digest("hex");

/** Validate the Nginx-injected handoff token. This only authorizes minting a session token. */
export const isValidTerminalAccessToken = (hostId, token) => {
	const id = Number(hostId);
	if (!Number.isSafeInteger(id) || id <= 0 || typeof token !== "string") return false;
	if (!/^[a-f0-9]{64}$/.test(token)) return false;
	return safeEqualHex(token, getTerminalAccessToken(id));
};

/**
 * Mint a short-lived, host-bound session token. The browser receives it from a
 * same-origin request and presents it once in the WebSocket subprotocol.
 */
export const createTerminalSessionToken = (hostId, now = Date.now()) => {
	const id = Number(hostId);
	if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid terminal host");
	const issuedAt = Number(now);
	if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) throw new Error("Invalid token time");
	const nonce = randomBytes(16).toString("hex");
	return `v2.${issuedAt}.${nonce}.${signature(SESSION_CONTEXT, id, issuedAt, nonce)}`;
};

/** Validate and consume a session token. A token can never open two connections. */
export const consumeTerminalSessionToken = (hostId, token, now = Date.now()) => {
	const id = Number(hostId);
	const current = Number(now);
	if (!Number.isSafeInteger(id) || id <= 0 || typeof token !== "string") return false;
	const match = TOKEN_PATTERN.exec(token);
	if (!match) return false;
	const issuedAt = Number(match[1]);
	const nonce = match[2];
	if (!Number.isSafeInteger(issuedAt) || issuedAt > current + 30_000) return false;
	if (current - issuedAt > TERMINAL_SESSION_TTL_MS) return false;
	const expected = signature(SESSION_CONTEXT, id, issuedAt, nonce);
	if (!safeEqualHex(match[3], expected)) return false;
	pruneConsumedTokens(current);
	if (consumedTokens.has(nonce)) return false;
	consumedTokens.set(nonce, issuedAt + TERMINAL_SESSION_TTL_MS);
	return true;
};

/** Normalize one origin for exact comparison, rejecting non-HTTP schemes. */
export const parseTerminalOrigin = (value) => {
	if (typeof value !== "string" || !value) return null;
	try {
		const url = new URL(value);
		if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
		if (url.pathname !== "/" || url.search || url.hash) return null;
		return { protocol: url.protocol, hostname: url.hostname.toLowerCase(), origin: url.origin, port: url.port };
	} catch {
		return null;
	}
};

const stripBrackets = (hostname) =>
	hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

/**
 * A session may only be opened from the host's own HTTPS origin. Hostnames come
 * from the persisted domain relation, never from the client-controlled Origin.
 * @param {string} originValue
 * @param {{hostnames?: string[], hostHeader?: string, allowHttp?: boolean}} [options]
 */
export const isAllowedTerminalOrigin = (originValue, { hostnames = [], hostHeader, allowHttp = false } = {}) => {
	const origin = parseTerminalOrigin(originValue);
	if (!origin) return false;
	if (!allowHttp && origin.protocol !== "https:") return false;
	const configured = hostnames
		.map((name) =>
			String(name || "")
				.trim()
				.toLowerCase(),
		)
		.filter((name) => name && !name.startsWith("~"))
		.map(stripBrackets);
	const allowed = new Set(configured);
	if (!allowed.size && hostHeader) {
		const header = String(hostHeader).trim().toLowerCase();
		const headerHost = header.startsWith("[") ? header.slice(1, header.indexOf("]") + 1) : header.split(":")[0];
		allowed.add(stripBrackets(headerHost));
	}
	const originHost = stripBrackets(origin.hostname);
	if (!allowed.has(originHost)) return false;
	// Reject an IPv6-ish or path-like string that URL parsing left in the hostname.
	if (isIP(originHost) === 0 && originHost !== originHost.replace(/[^a-z0-9.-]/g, "")) return false;
	return true;
};
