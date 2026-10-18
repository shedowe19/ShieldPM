import { describe, expect, it } from "vitest";
import {
	decodeWasiHttpBody,
	MAX_WASI_HTTP_BODY_BYTES,
	normalizeWasiHttpRequest,
	parseWasiHttpResult,
	validateWasiHostSettings,
	wasiHttpEnvironment,
} from "../../lib/wasi-http-contract.js";

const request = (overrides = {}) => ({
	method: "POST",
	uri: "/upload/%E2%9C%93",
	query: "name=a%2Bb&name=second",
	host: "example.invalid:8443",
	scheme: "https",
	remote_addr: "2001:db8::1",
	headers: [
		{ name: "Content-Type", value: "application/octet-stream" },
		{ name: "X-Multiple", value: "first" },
		{ name: "X-Multiple", value: "second" },
	],
	body_base64: "AP+AwoAK",
	...overrides,
});
const parse = (value, mode = "filter") =>
	parseWasiHttpResult(JSON.stringify(value), { mode, protocol: "http-json-v1" });
const respond = (overrides = {}) => ({
	version: 1,
	action: "respond",
	response: { status: 201, headers: [], body_base64: "AP+AwoAK", ...overrides },
});

describe("WASI host execution settings", () => {
	it("applies bounded defaults and returns a detached copy of explicit case-sensitive settings", () => {
		expect(validateWasiHostSettings({})).toEqual({ args: [], env: [], timeout_ms: 10000 });
		const input = {
			args: ["first", "ü"],
			env: [{ name: "CaseSensitive", value: "explicit\nvalue" }],
			timeout_ms: 60000,
		};
		const result = validateWasiHostSettings(input);
		expect(result).toEqual(input);
		result.args.push("later");
		result.env[0].value = "changed";
		expect(input.args).toEqual(["first", "ü"]);
		expect(input.env[0].value).toBe("explicit\nvalue");
	});
	it("counts UTF-8 bytes and every argument separator at the exact 64 KiB boundary", () => {
		const args = [...Array(15).fill("x".repeat(4096)), "x".repeat(4080)];
		expect(validateWasiHostSettings({ args }).args).toEqual(args);
		expect(() => validateWasiHostSettings({ args: [...args.slice(0, 15), "x".repeat(4081)] })).toThrow("64 KiB");
		expect(validateWasiHostSettings({ args: ["ü".repeat(2048)] }).args).toEqual(["ü".repeat(2048)]);
	});
	it.each([
		null,
		[],
		{ unknown: true },
		{ stdin: "caller-selected input" },
		{ args: Array(33).fill("argument") },
		{ args: ["embedded\0value"] },
		{ args: ["ü".repeat(2049)] },
		{ env: [{ name: "SHIELDPM_HTTP_METHOD", value: "spoofed" }] },
		{ env: [{ name: "INVALID=NAME", value: "value" }] },
		{ env: [{ name: "N".repeat(129), value: "value" }] },
		{ env: [{ name: "VALID", value: "embedded\0value" }] },
		{ env: [{ name: "VALID", value: "x".repeat(4097) }] },
		{ env: [{ name: "VALID", value: "value", unknown: true }] },
		{
			env: [
				{ name: "VALID", value: "one" },
				{ name: "VALID", value: "two" },
			],
		},
		{ env: Array.from({ length: 33 }, (_, index) => ({ name: `KEY_${index}`, value: "value" })) },
		{ timeout_ms: 99 },
		{ timeout_ms: 60001 },
		{ timeout_ms: 100.5 },
		{ timeout_ms: "1000" },
	])("rejects invalid host settings without weakening standalone bounds: %#", (input) => {
		expect(() => validateWasiHostSettings(input)).toThrow("Invalid WASI host settings");
	});
});

describe("WASI host HTTP request contract", () => {
	it("preserves encoded targets, duplicate headers, IPv6 and binary body without mutating input", () => {
		const input = request();
		const before = structuredClone(input);
		const result = normalizeWasiHttpRequest(input);
		expect(result.request).toEqual(before);
		expect(result.body).toEqual(Buffer.from([0, 255, 128, 194, 128, 10]));
		expect(input).toEqual(before);
	});
	it("accepts exactly 64 KiB of arbitrary bytes and rejects one additional decoded byte", () => {
		const bytes = Buffer.alloc(MAX_WASI_HTTP_BODY_BYTES, 255);
		expect(normalizeWasiHttpRequest(request({ body_base64: bytes.toString("base64") })).body).toEqual(bytes);
		expect(() =>
			normalizeWasiHttpRequest(request({ body_base64: Buffer.alloc(bytes.length + 1).toString("base64") })),
		).toThrow("Invalid WASI HTTP exchange");
	});
	it.each(["CustomVerb", "get"])("preserves the case of the valid extension method %s", (method) => {
		expect(normalizeWasiHttpRequest(request({ method })).request.method).toBe(method);
		expect(wasiHttpEnvironment(request({ method }))).toContainEqual({
			name: "SHIELDPM_HTTP_METHOD",
			value: method,
		});
	});
	it("validates the complete 768 KiB response body and a malformed one-MiB Base64 string without overflowing", () => {
		const bytes = Buffer.alloc(768 * 1024, 255);
		const encoded = bytes.toString("base64");
		expect(encoded.length).toBe(1024 * 1024);
		expect(decodeWasiHttpBody(encoded, bytes.length)).toEqual(bytes);
		expect(parse(respond({ body_base64: encoded })).response.body_base64).toBe(encoded);
		expect(() => decodeWasiHttpBody(`${encoded.slice(0, -1)}!`, bytes.length)).toThrow(
			"Invalid WASI HTTP exchange",
		);
	});
	it.each(["A", "A===", "AA=", "AA===", "AA==\n", " AA==", "AB==", "AAB=", "AA-_", "!!!!", 1, null])(
		"rejects malformed or noncanonical base64 instead of decoding it permissively: %#",
		(value) => {
			expect(() => decodeWasiHttpBody(value)).toThrow("Invalid WASI HTTP exchange");
		},
	);
	it.each([
		{ method: "GET\r\nX: value" },
		{ method: "GET SPACE" },
		{ uri: "https://other.invalid/" },
		{ uri: "/path\0suffix" },
		{ uri: `/${"x".repeat(4096)}` },
		{ query: "x\nInjected: yes" },
		{ query: "ü".repeat(2049) },
		{ host: "example.invalid\r\nInjected: yes" },
		{ host: "x".repeat(513) },
		{ scheme: "file" },
		{ remote_addr: "x".repeat(129) },
		{ body_base64: undefined },
		{ extra: true },
		{ headers: [{ name: "X-Test", value: "one\r\nInjected: two" }] },
		{ headers: [{ name: "Bad:Name", value: "value" }] },
		{ headers: [{ name: "X-Test", value: null }] },
		{ headers: [{ name: "X-Test", value: "value", extra: true }] },
		{ headers: Array.from({ length: 129 }, () => ({ name: "X-Test", value: "value" })) },
		{ headers: Array.from({ length: 5 }, () => ({ name: "X-Test", value: "x".repeat(8192) })) },
	])("rejects invalid request metadata before guest execution: %#", (overrides) => {
		expect(() => normalizeWasiHttpRequest(request(overrides))).toThrow("Invalid WASI HTTP exchange");
	});
	it("creates only explicit request variables while preserving administrator environment name case", () => {
		const env = [{ name: "CaseSensitive", value: "administrator value" }];
		const result = wasiHttpEnvironment(request(), env);
		expect(result).toEqual([
			{ name: "CaseSensitive", value: "administrator value" },
			{ name: "SHIELDPM_HTTP_METHOD", value: "POST" },
			{ name: "SHIELDPM_HTTP_URI", value: "/upload/%E2%9C%93" },
			{ name: "SHIELDPM_HTTP_QUERY", value: "name=a%2Bb&name=second" },
			{ name: "SHIELDPM_HTTP_HOST", value: "example.invalid:8443" },
			{ name: "SHIELDPM_HTTP_SCHEME", value: "https" },
			{ name: "SHIELDPM_HTTP_REMOTE_ADDR", value: "2001:db8::1" },
		]);
		expect(env).toEqual([{ name: "CaseSensitive", value: "administrator value" }]);
	});
	it.each(["SHIELDPM_HTTP_METHOD", "SHIELDPM_HTTP_UNKNOWN", "SHIELDPM_HTTP_"])(
		"rejects every reserved environment name instead of permitting metadata replacement: %s",
		(name) => {
			expect(() => wasiHttpEnvironment(request(), [{ name, value: "spoofed" }])).toThrow("reserved");
		},
	);
});

describe("WASI host HTTP result contract", () => {
	it("accepts a pass-through result and explicit header removal, replacement and binary body mutation", () => {
		expect(parse({ version: 1, action: "continue" })).toEqual({ version: 1, action: "continue", request: {} });
		const output = {
			version: 1,
			action: "continue",
			request: {
				headers: [
					{ name: "X-Remove", value: null },
					{ name: "X-Replace", value: "new value" },
				],
				body_base64: "AP+AwoAK",
			},
		};
		expect(parse(output)).toEqual(output);
	});
	it("accepts an explicit response with duplicate Set-Cookie headers and an exact binary body", () => {
		const output = respond({
			headers: [
				{ name: "Set-Cookie", value: "one=1; Path=/; HttpOnly" },
				{ name: "Set-Cookie", value: "two=2; Path=/; Secure" },
			],
		});
		expect(parse(output)).toEqual(output);
		expect(parse(output, "handler")).toEqual(output);
		expect(decodeWasiHttpBody(parse(output).response.body_base64)).toEqual(
			Buffer.from([0, 255, 128, 194, 128, 10]),
		);
	});
	it.each([204, 304])("validates but removes the response body for status %s", (status) => {
		expect(parse(respond({ status }))).toEqual(respond({ status, body_base64: "" }));
		expect(() => parse(respond({ status, body_base64: "AB==" }))).toThrow();
	});
	it("uses the selected stdio handler protocol without interpreting output as executable response metadata", () => {
		const stdout = '{"version":1,"action":"continue"}\nü\0';
		expect(parseWasiHttpResult(stdout, { mode: "handler", protocol: "stdio" })).toEqual({
			version: 1,
			action: "respond",
			response: {
				status: 200,
				headers: [{ name: "Content-Type", value: "text/plain; charset=utf-8" }],
				body_base64: Buffer.from(stdout).toString("base64"),
			},
		});
	});
	it.each([
		"host",
		"connection",
		"content-length",
		"transfer-encoding",
		"upgrade",
		"trailer",
		"keep-alive",
		"proxy-connection",
		"proxy-authenticate",
		"proxy-authorization",
	])("rejects guest manipulation of HTTP framing through %s in request and response", (name) => {
		const headers = [{ name: name.toUpperCase(), value: "untrusted" }];
		expect(() => parse({ version: 1, action: "continue", request: { headers } })).toThrow();
		expect(() => parse(respond({ headers }))).toThrow();
	});
	it.each([
		{ version: 2, action: "continue" },
		{ version: 1, action: "continue", extra: true },
		{ version: 1, action: "continue", response: {} },
		{ version: 1, action: "continue", request: null },
		{ version: 1, action: "continue", request: { headers: null } },
		{ version: 1, action: "continue", request: { body_base64: null } },
		{ version: 1, action: "continue", request: { uri: "/rewritten" } },
		{ version: 1, action: "continue", request: { body_base64: "AB==" } },
		{
			version: 1,
			action: "continue",
			request: {
				headers: [
					{ name: "X-Test", value: "one" },
					{ name: "x-test", value: "two" },
				],
			},
		},
		{ version: 1, action: "respond", request: {}, response: { status: 200 } },
		respond({ status: 199 }),
		respond({ status: 600 }),
		respond({ status: 200.5 }),
		respond({ status: "200" }),
		respond({ headers: [{ name: "X-Test", value: "one\nInjected: two" }] }),
		respond({ headers: [{ name: "X-Test", value: null }] }),
		respond({ headers: null }),
		respond({ body_base64: null }),
		respond({ body_base64: "AB==" }),
		respond({ body_base64: Buffer.alloc(768 * 1024 + 1).toString("base64") }),
		respond({ unknown: true }),
		null,
		[],
	])("rejects malformed or ambiguous guest results: %#", (value) => {
		expect(() => parse(value)).toThrow("Invalid WASI HTTP exchange");
	});
	it.each(["not JSON", "{}\n{}", 'diagnostic\n{"version":1,"action":"continue"}'])(
		"rejects output outside one strict JSON document: %#",
		(stdout) => {
			expect(() => parseWasiHttpResult(stdout, { mode: "filter", protocol: "http-json-v1" })).toThrow();
		},
	);
	it("requires handlers to respond and filters to use the explicit JSON protocol", () => {
		expect(() => parse({ version: 1, action: "continue" }, "handler")).toThrow();
		expect(() => parseWasiHttpResult("output", { mode: "filter", protocol: "stdio" })).toThrow();
		expect(() => parseWasiHttpResult("output", { mode: "handler", protocol: "guessed" })).toThrow();
	});
});
