/** Versioned, bounded HTTP exchange for trusted WASI command applications. */
import errs from "./error.js";

export const MAX_WASI_HTTP_BODY_BYTES = 65536;
export const MAX_WASI_HTTP_PACKET_BYTES = 256 * 1024;
const MAX_HEADERS = 128;
const MAX_HEADER_BYTES = 32768;
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/;
const FRAMING_HEADERS = new Set([
	"host",
	"connection",
	"content-length",
	"transfer-encoding",
	"upgrade",
	"te", // codespell:ignore te
	"trailer",
	"keep-alive",
	"proxy-connection",
	"proxy-authenticate",
	"proxy-authorization",
]);
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const keys = (value, allowed) => object(value) && Object.keys(value).every((key) => allowed.includes(key));
const text = (value, maximum, pattern = undefined, allowTab = false) =>
	typeof value === "string" &&
	Buffer.byteLength(value) <= maximum &&
	(!pattern || pattern.test(value)) &&
	![...value].some((character) => {
		const code = character.charCodeAt(0);
		return code === 127 || (code < 32 && !(allowTab && code === 9));
	});
const invalid = () => new errs.ValidationError("Invalid WASI HTTP exchange");

/** The public host settings retain standalone execution bounds and never accept stdin or reserved metadata. */
export function validateWasiHostSettings(input) {
	if (!keys(input, ["args", "env", "timeout_ms"])) throw new errs.ValidationError("Invalid WASI host settings");
	const { args = [], env = [], timeout_ms: timeout = 10000 } = input;
	const argument = (value) => typeof value === "string" && !value.includes("\0") && Buffer.byteLength(value) <= 4096;
	if (
		!Array.isArray(args) ||
		args.length > 32 ||
		!args.every(argument) ||
		!Array.isArray(env) ||
		env.length > 32 ||
		!env.every(
			(entry) =>
				keys(entry, ["name", "value"]) &&
				typeof entry.name === "string" &&
				/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(entry.name) &&
				!entry.name.startsWith("SHIELDPM_HTTP_") &&
				argument(entry.value),
		) ||
		new Set(env.map((entry) => entry.name)).size !== env.length ||
		!Number.isInteger(timeout) ||
		timeout < 100 ||
		timeout > 60000
	)
		throw new errs.ValidationError("Invalid WASI host settings");
	const size = [...args, ...env.flatMap((entry) => [entry.name, entry.value])].reduce(
		(sum, value) => sum + Buffer.byteLength(value) + 1,
		0,
	);
	if (size > 65536) throw new errs.ValidationError("WASI host settings exceed 64 KiB");
	return { args: [...args], env: env.map(({ name, value }) => ({ name, value })), timeout_ms: timeout };
}

/** Decode canonical base64 without silently accepting ignored characters or excessive allocation. */
export function decodeWasiHttpBody(value, maximum = MAX_WASI_HTTP_BODY_BYTES) {
	if (
		typeof value !== "string" ||
		value.length > Math.ceil(maximum / 3) * 4 ||
		!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
	)
		throw invalid();
	const bytes = Buffer.from(value, "base64");
	if (bytes.length > maximum || bytes.toString("base64") !== value) throw invalid();
	return bytes;
}

function headers(value, { changes = false, response = false } = {}) {
	if (!Array.isArray(value) || value.length > MAX_HEADERS) throw invalid();
	let size = 0;
	const names = new Set();
	return value.map((entry) => {
		if (
			!keys(entry, ["name", "value"]) ||
			typeof entry.name !== "string" ||
			!TOKEN.test(entry.name) ||
			(!(changes && !response && entry.value === null) && !text(entry.value, 8192, undefined, true))
		)
			throw invalid();
		const name = entry.name.toLowerCase();
		if (changes && (FRAMING_HEADERS.has(name) || (!response && names.has(name)))) throw invalid();
		names.add(name);
		size += Buffer.byteLength(entry.name) + Buffer.byteLength(entry.value ?? "") + 4;
		if (size > MAX_HEADER_BYTES) throw invalid();
		return { name: entry.name, value: entry.value };
	});
}

/** Validate the Nginx-originated request before it is passed to any application. */
export function normalizeWasiHttpRequest(input) {
	if (
		!keys(input, ["method", "uri", "query", "host", "scheme", "remote_addr", "headers", "body_base64"]) ||
		!text(input.method, 32, TOKEN) ||
		!text(input.uri, 4096) ||
		!input.uri.startsWith("/") ||
		!text(input.query, 4096) ||
		!text(input.host, 512) ||
		!["http", "https"].includes(input.scheme) ||
		!text(input.remote_addr, 128)
	)
		throw invalid();
	const request = {
		method: input.method,
		uri: input.uri,
		query: input.query,
		host: input.host,
		scheme: input.scheme,
		remote_addr: input.remote_addr,
		headers: headers(input.headers),
		body_base64: input.body_base64,
	};
	const body = decodeWasiHttpBody(input.body_base64);
	return { request, body };
}

/** Reject reserved variables so metadata cannot be replaced by an administrator's run settings. */
export function wasiHttpEnvironment(request, env = []) {
	if (
		!Array.isArray(env) ||
		env.some((entry) => typeof entry?.name !== "string" || entry.name.startsWith("SHIELDPM_HTTP_"))
	)
		throw new errs.ValidationError("SHIELDPM_HTTP_ environment names are reserved for HTTP request metadata");
	return [
		...env,
		...Object.entries({
			METHOD: request.method,
			URI: request.uri,
			QUERY: request.query,
			HOST: request.host,
			SCHEME: request.scheme,
			REMOTE_ADDR: request.remote_addr,
		}).map(([name, value]) => ({ name: `SHIELDPM_HTTP_${name}`, value })),
	];
}

/** Interpret only the explicitly selected output protocol; stdout is never guessed as HTTP or JSON. */
export function parseWasiHttpResult(stdout, { mode, protocol }) {
	if (
		!["filter", "handler"].includes(mode) ||
		!["stdio", "http-json-v1"].includes(protocol) ||
		(mode === "filter" && protocol !== "http-json-v1")
	)
		throw invalid();
	if (protocol === "stdio")
		return {
			version: 1,
			action: "respond",
			response: {
				status: 200,
				headers: [{ name: "Content-Type", value: "text/plain; charset=utf-8" }],
				body_base64: Buffer.from(stdout, "utf8").toString("base64"),
			},
		};
	let output;
	try {
		output = JSON.parse(stdout);
	} catch {
		throw invalid();
	}
	if (!keys(output, ["version", "action", "request", "response"]) || output.version !== 1) throw invalid();
	if (output.action === "continue" && mode === "filter" && output.response === undefined) {
		const request = output.request === undefined ? {} : output.request;
		if (!keys(request, ["headers", "body_base64"])) throw invalid();
		const result = { version: 1, action: "continue", request: {} };
		if (request.headers !== undefined) result.request.headers = headers(request.headers, { changes: true });
		if (request.body_base64 !== undefined) {
			decodeWasiHttpBody(request.body_base64);
			result.request.body_base64 = request.body_base64;
		}
		return result;
	}
	if (
		output.action !== "respond" ||
		output.request !== undefined ||
		!keys(output.response, ["status", "headers", "body_base64"]) ||
		!Number.isInteger(output.response.status) ||
		output.response.status < 200 ||
		output.response.status > 599
	)
		throw invalid();
	const response = output.response;
	decodeWasiHttpBody(response.body_base64 === undefined ? "" : response.body_base64, 768 * 1024);
	return {
		version: 1,
		action: "respond",
		response: {
			status: response.status,
			headers: headers(response.headers === undefined ? [] : response.headers, { changes: true, response: true }),
			body_base64: response.status === 204 || response.status === 304 ? "" : (response.body_base64 ?? ""),
		},
	};
}
