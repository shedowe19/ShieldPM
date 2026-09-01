import crypto from "node:crypto";
import { getPrivateKey } from "../../lib/config.js";

const MAX_CALLS_PER_RESPONSE = 4;
const MAX_CALLS_PER_TURN = 8;
const MAX_MUTATIONS_PER_TURN = 2;
const MAX_DESTRUCTIVE_PER_TURN = 1;
const MAX_RESULT_BYTES = 32 * 1024;
const MAX_CONFIRMATION_DETAILS_BYTES = 24 * 1024;
const CONFIRMATION_TTL_SECONDS = 5 * 60;
const MAX_CONFIRMATION_TOKEN_LENGTH = 4096;
const MAX_PENDING_CONFIRMATIONS = 1000;

const pendingConfirmations = new Map();
const SECRET_KEY = /(?:^|_)(?:api_?key|authorization|credential|password|private_?key|secret|token)(?:$|_)/i;
const SECRET_VALUE =
	/(?:-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----|\b(?:gh[opusr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})\b|\bBearer\s+[A-Za-z0-9._~+/-]{16,})/i;

const DESTRUCTIVE_TOOLS = new Set([
	"delete_access_list",
	"delete_certificate",
	"delete_cloudflared_tunnel",
	"delete_dead_host",
	"delete_ddns_provider",
	"delete_proxy_host",
	"delete_redirection_host",
	"delete_stream",
	"delete_tor_onion_service",
	"delete_user",
	"force_nginx_reload",
	"test_ddns_provider",
	"update_user_password",
	"update_user_permissions",
]);

const READ_PREFIXES = ["get_", "read_", "test_", "validate_"];

/**
 * @param {string} name
 * @returns {"read"|"mutation"|"destructive"}
 */
export const getToolEffect = (name) => {
	if (DESTRUCTIVE_TOOLS.has(name)) return "destructive";
	if (READ_PREFIXES.some((prefix) => name.startsWith(prefix))) return "read";
	return "mutation";
};

/** @returns {{calls:number,mutations:number,destructive:number,untrustedRead:boolean}} */
export const createExecutionState = () => ({ calls: 0, mutations: 0, destructive: 0, untrustedRead: false });

const stableValue = (value) => {
	if (Array.isArray(value)) return value.map(stableValue);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((key) => [key, stableValue(value[key])]),
		);
	}
	return value;
};

const getActorId = (access) => {
	const id = access?.token?.getUserId?.(0);
	if (!Number.isInteger(id) || id < 1) throw new TypeError("AI operation has no authenticated actor");
	return id;
};

const signingKey = () => crypto.createHash("sha256").update(String(getPrivateKey())).digest();

const confirmationPayload = (access, name, args, expiresAt, nonce) => ({
	actor: getActorId(access),
	name,
	args_sha256: crypto
		.createHash("sha256")
		.update(JSON.stringify(stableValue(args)))
		.digest("base64url"),
	expires_at: expiresAt,
	nonce,
});

const prunePendingConfirmations = (now) => {
	for (const [nonce, pending] of pendingConfirmations) {
		if (pending.expires_at < now) pendingConfirmations.delete(nonce);
	}
	while (pendingConfirmations.size >= MAX_PENDING_CONFIRMATIONS) {
		pendingConfirmations.delete(pendingConfirmations.keys().next().value);
	}
};

const verifyConfirmation = (access, token) => {
	if (typeof token !== "string" || token.length > MAX_CONFIRMATION_TOKEN_LENGTH) return null;
	const [encoded, suppliedSignature, extra] = token.split(".");
	if (!encoded || !suppliedSignature || extra) return null;
	const expectedSignature = crypto.createHmac("sha256", signingKey()).update(encoded).digest();
	let supplied;
	try {
		supplied = Buffer.from(suppliedSignature, "base64url");
	} catch (_err) {
		return null;
	}
	if (supplied.length !== expectedSignature.length || !crypto.timingSafeEqual(supplied, expectedSignature)) {
		return null;
	}

	let payload;
	try {
		payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
	} catch (_err) {
		return null;
	}
	const now = Math.floor(Date.now() / 1000);
	if (
		!payload ||
		typeof payload !== "object" ||
		Array.isArray(payload) ||
		!Number.isInteger(payload.expires_at) ||
		payload.expires_at < now ||
		payload.expires_at > now + CONFIRMATION_TTL_SECONDS ||
		typeof payload.name !== "string" ||
		typeof payload.args_sha256 !== "string" ||
		!/^[A-Za-z0-9_-]{43}$/.test(payload.args_sha256) ||
		typeof payload.nonce !== "string" ||
		!/^[A-Za-z0-9_-]{20,24}$/.test(payload.nonce)
	) {
		return null;
	}
	prunePendingConfirmations(now);
	const pending = pendingConfirmations.get(payload.nonce);
	if (!pending) return null;
	const expected = confirmationPayload(access, payload.name, pending.args, payload.expires_at, payload.nonce);
	return JSON.stringify(payload) === JSON.stringify(expected) ? pending : null;
};

/**
 * @param {import("../../lib/types.js").Access} access
 * @param {string} name
 * @param {Object} args
 * @returns {string}
 */
export const issueConfirmation = (access, name, args) => {
	serializeConfirmationDetails(args);
	const now = Math.floor(Date.now() / 1000);
	prunePendingConfirmations(now);
	const expiresAt = now + CONFIRMATION_TTL_SECONDS;
	const nonce = crypto.randomBytes(16).toString("base64url");
	const stableArgs = stableValue(args);
	const payload = confirmationPayload(access, name, stableArgs, expiresAt, nonce);
	pendingConfirmations.set(nonce, { actor: payload.actor, name, args: stableArgs, expires_at: expiresAt, nonce });
	const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
	const signature = crypto.createHmac("sha256", signingKey()).update(encoded).digest("base64url");
	return `${encoded}.${signature}`;
};

/**
 * Validate and reveal a pending action only to the same authenticated actor.
 * This does not consume the token; execution consumes it atomically in the
 * current backend process.
 *
 * @param {import("../../lib/types.js").Access} access
 * @param {string} token
 * @returns {{actor:number,name:string,args:Object,expires_at:number,nonce:string}|null}
 */
export const readConfirmation = (access, token) => verifyConfirmation(access, token);

/**
 * @param {import("../../lib/types.js").Access} access
 * @param {string} name
 * @param {Object} args
 * @param {string} token
 * @returns {boolean}
 */
export const consumeConfirmation = (access, name, args, token) => {
	const payload = verifyConfirmation(access, token);
	if (!payload) return false;
	if (name !== payload.name) return false;
	const expected = confirmationPayload(access, name, args, payload.expires_at, payload.nonce);
	if (
		expected.args_sha256 !==
		confirmationPayload(access, payload.name, payload.args, payload.expires_at, payload.nonce).args_sha256
	)
		return false;
	pendingConfirmations.delete(payload.nonce);
	return true;
};

/**
 * Enforce per-response and per-turn budgets before a tool call reaches an
 * internal service.
 *
 * @param {Object} state
 * @param {string} name
 * @param {number} responseCallCount
 * @returns {"read"|"mutation"|"destructive"}
 */
export const reserveToolCall = (state, name, responseCallCount) => {
	if (responseCallCount > MAX_CALLS_PER_RESPONSE)
		throw new RangeError("AI response exceeds the four-tool-call limit");
	if (state.calls >= MAX_CALLS_PER_TURN) throw new RangeError("AI turn exceeds the eight-tool-call limit");
	const effect = getToolEffect(name);
	if (effect !== "read" && state.untrustedRead) {
		throw new Error("Mutation blocked after an untrusted read; start a new user turn");
	}
	if (effect !== "read" && state.mutations >= MAX_MUTATIONS_PER_TURN) {
		throw new RangeError("AI turn exceeds the two-mutation limit");
	}
	if (effect === "destructive" && state.destructive >= MAX_DESTRUCTIVE_PER_TURN) {
		throw new RangeError("AI turn exceeds the one-destructive-action limit");
	}
	state.calls++;
	if (effect !== "read") state.mutations++;
	if (effect === "destructive") state.destructive++;
	if (effect === "read") state.untrustedRead = true;
	return effect;
};

/**
 * @param {unknown} value
 * @param {WeakSet<object>} [seen]
 * @returns {unknown}
 */
export const redactToolData = (value, seen = new WeakSet()) => {
	if (typeof value === "string") return SECRET_VALUE.test(value) ? "[REDACTED]" : value;
	if (value === null || typeof value !== "object") return value;
	if (seen.has(value)) return "[REDACTED]";
	seen.add(value);
	if (Array.isArray(value)) return value.map((entry) => redactToolData(entry, seen));
	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [
			key,
			SECRET_KEY.test(key) ? "[REDACTED]" : redactToolData(entry, seen),
		]),
	);
};

/**
 * Produce the complete canonical action shown to the user. Confirmation is
 * refused when exact arguments would need redaction or UI truncation.
 *
 * @param {Object} args
 * @returns {string}
 */
export const serializeConfirmationDetails = (args) => {
	const canonical = JSON.stringify(stableValue(args));
	const visible = JSON.stringify(redactToolData(stableValue(args)));
	if (canonical !== visible) throw new TypeError("AI confirmation arguments must not contain secret material");
	if (Buffer.byteLength(canonical, "utf8") > MAX_CONFIRMATION_DETAILS_BYTES) {
		throw new RangeError("AI confirmation arguments exceed the exact-review limit");
	}
	return canonical;
};

/**
 * @param {unknown} result
 * @returns {string}
 */
export const serializeToolResult = (result) => {
	let value;
	if (typeof result === "string") {
		try {
			value = JSON.stringify(redactToolData(JSON.parse(result)));
		} catch (_err) {
			value = redactToolData(result);
		}
	} else {
		value = JSON.stringify(redactToolData(result));
	}
	const buffer = Buffer.from(String(value));
	if (buffer.length <= MAX_RESULT_BYTES) return buffer.toString("utf8");
	return `${buffer.subarray(0, MAX_RESULT_BYTES).toString("utf8")}\n[TRUNCATED]`;
};

export const AI_LIMITS = Object.freeze({
	maxCallsPerResponse: MAX_CALLS_PER_RESPONSE,
	maxCallsPerTurn: MAX_CALLS_PER_TURN,
	maxMutationsPerTurn: MAX_MUTATIONS_PER_TURN,
	maxDestructivePerTurn: MAX_DESTRUCTIVE_PER_TURN,
	maxLoops: 5,
});
