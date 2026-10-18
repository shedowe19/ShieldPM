import { fork } from "node:child_process";
import { performance } from "node:perf_hooks";
import { StringDecoder } from "node:string_decoder";
import errs from "./error.js";
import {
	MAX_WASI_HTTP_PACKET_BYTES,
	normalizeWasiHttpRequest,
	validateWasiHostSettings,
	wasiHttpEnvironment,
} from "./wasi-http-contract.js";

export const MAX_WASI_OUTPUT_BYTES = 1024 * 1024;
export const MAX_WASI_INPUT_BYTES = 64 * 1024;
const MAX_MODULE_BYTES = 16 * 1024 * 1024;
const MAX_ACTIVE_RUNS = 2;
let activeRuns = 0;

/** @typedef {{args?: string[], env?: {name: string, value: string}[], stdin?: string, timeout_ms?: number}} WasiInput */
/** @typedef {{status: "completed" | "failed" | "timed_out" | "output_limit" | "cancelled", exit_code: number | null, stdout: string, stderr: string, duration_ms: number, signal: string | null, truncated: boolean}} WasiResult */

const text = (value) => typeof value === "string" && !value.includes("\0");
const boundedText = (value) => text(value) && Buffer.byteLength(value) <= 4096;

/** Validate independently of the HTTP schema so internal callers cannot bypass execution bounds. */
function executionInput(bytes, input, httpRequest = false) {
	if (!Buffer.isBuffer(bytes) || bytes.length < 8 || bytes.length > MAX_MODULE_BYTES)
		throw new errs.ValidationError("A binary WASI application up to 16 MiB is required");
	if (!input || typeof input !== "object" || Array.isArray(input))
		throw new errs.ValidationError("Invalid WASI execution input");
	const { args = [], env = [], stdin = "", timeout_ms: timeout = 10000 } = input;
	if (!Array.isArray(args) || args.length > 32 || !args.every(boundedText))
		throw new errs.ValidationError(
			"WASI arguments must contain at most 32 strings up to 4096 bytes without NUL bytes",
		);
	if (
		!Array.isArray(env) ||
		env.length > (httpRequest ? 40 : 32) ||
		!env.every(
			(entry) =>
				entry &&
				typeof entry === "object" &&
				typeof entry.name === "string" &&
				/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(entry.name) &&
				boundedText(entry.value),
		) ||
		new Set(env.map((entry) => entry.name)).size !== env.length
	)
		throw new errs.ValidationError(
			"WASI environment must contain at most 32 uniquely named string values up to 4096 bytes",
		);
	const metadataBytes = [...args, ...env.flatMap((entry) => [entry.name, entry.value])].reduce(
		(size, value) => size + Buffer.byteLength(value) + 1,
		0,
	);
	if (metadataBytes > (httpRequest ? 96 * 1024 : MAX_WASI_INPUT_BYTES))
		throw new errs.ValidationError("WASI arguments and environment must not exceed 64 KiB");
	if (
		(!httpRequest && typeof stdin !== "string") ||
		(httpRequest && !Buffer.isBuffer(stdin)) ||
		Buffer.byteLength(stdin) > (httpRequest ? MAX_WASI_HTTP_PACKET_BYTES : MAX_WASI_INPUT_BYTES)
	)
		throw new errs.ValidationError("WASI standard input must not exceed 64 KiB");
	if (!Number.isInteger(timeout) || timeout < 100 || timeout > 60000)
		throw new errs.ValidationError("WASI timeout must be between 100 and 60000 milliseconds");
	return { args: [...args], env: env.map(({ name, value }) => ({ name, value })), stdin, timeout };
}

/**
 * Execute one trusted administrator application in a disposable Node process, never in the API event loop.
 * This has bounded execution and output; node:wasi does not provide a hostile-code security sandbox.
 * @param {Buffer} bytes
 * @param {WasiInput} input
 * @param {{signal?: AbortSignal}} options
 * @returns {Promise<WasiResult>}
 */
export async function runWasiApplication(bytes, input = {}, { signal } = {}) {
	const validated = executionInput(bytes, input);
	return executeWasiApplication(bytes, validated, signal);
}

/**
 * Trusted HTTP-only adapter: raw request bytes or a bounded versioned envelope, never caller-selected limits.
 * Public standalone execution retains its original 64-KiB string input and environment bounds.
 * @param {Buffer} bytes
 * @param {{args?: string[], env?: {name: string, value: string}[], timeout_ms?: number}} settings
 * @param {any} request
 * @param {{protocol: "stdio" | "http-json-v1", signal?: AbortSignal}} options
 * @returns {Promise<WasiResult>}
 */
export async function runWasiHttpApplication(bytes, settings, request, { protocol, signal }) {
	if (!["stdio", "http-json-v1"].includes(protocol)) throw new errs.ValidationError("Invalid WASI HTTP protocol");
	// Validate administrator-controlled settings under the ordinary public limits first.
	const checked = executionInput(bytes, { ...validateWasiHostSettings(settings), stdin: "" });
	const normalized = normalizeWasiHttpRequest(request);
	const stdin =
		protocol === "stdio"
			? normalized.body
			: Buffer.from(JSON.stringify({ version: 1, request: normalized.request }));
	const env = wasiHttpEnvironment(normalized.request, checked.env);
	const validated = executionInput(bytes, { args: checked.args, env, stdin, timeout_ms: checked.timeout }, true);
	return executeWasiApplication(bytes, validated, signal);
}

function executeWasiApplication(bytes, validated, signal) {
	const started = performance.now();
	const empty = () => ({
		status: /** @type {WasiResult["status"]} */ ("cancelled"),
		exit_code: null,
		stdout: "",
		stderr: "",
		duration_ms: Math.round(performance.now() - started),
		signal: null,
		truncated: false,
	});
	if (signal?.aborted) return empty();
	if (activeRuns >= MAX_ACTIVE_RUNS) throw new errs.ConfigurationError("WASI execution is busy; retry shortly");
	activeRuns++;
	return new Promise((resolve, reject) => {
		let child;
		let timer;
		let reason = null;
		let result = null;
		let outputBytes = 0;
		let truncated = false;
		let finished = false;
		const output = { stdout: [], stderr: [] };
		const decoders = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };
		const terminate = (status) => {
			if (finished || reason) return;
			reason = status;
			child?.kill("SIGKILL");
		};
		const abort = () => terminate("cancelled");
		const captureText = (stream, value) => {
			const chunk = Buffer.from(value, "utf8");
			const remaining = MAX_WASI_OUTPUT_BYTES - outputBytes;
			const accepted = chunk.subarray(0, remaining);
			if (accepted.length) output[stream].push(accepted);
			outputBytes += accepted.length;
			if (chunk.length > remaining) {
				truncated = true;
				terminate("output_limit");
			}
		};
		const capture = (stream, chunk) => captureText(stream, decoders[stream].write(chunk));
		// All captured bytes are UTF-8. Discard a final partial code point at the output limit.
		const decodedOutput = (stream) => new TextDecoder().decode(Buffer.concat(output[stream]), { stream: true });
		const cleanup = () => {
			finished = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", abort);
			activeRuns--;
		};
		try {
			child = fork(new URL("./wasi-runner-child.js", import.meta.url), [], {
				execPath: process.execPath,
				execArgv: [
					"--max-old-space-size=96",
					"--stack-size=1024",
					"--wasm-max-mem-pages=4096",
					"--wasm-max-table-size=100000",
					"--wasm-max-module-size=16777216",
					"--no-warnings",
				],
				env: {},
				serialization: "advanced",
				stdio: ["pipe", "pipe", "pipe", "ipc"],
			});
			child.stdout.on("data", (chunk) => capture("stdout", chunk));
			child.stderr.on("data", (chunk) => capture("stderr", chunk));
			// A command may close stdin before consuming all supplied input.
			child.stdin.on("error", () => {});
			child.on("error", () => terminate("failed"));
			child.on("message", (message) => {
				if (
					message &&
					["completed", "failed"].includes(message.status) &&
					(message.exit_code === null ||
						(Number.isInteger(message.exit_code) &&
							message.exit_code >= 0 &&
							message.exit_code <= 0xffffffff))
				)
					result = message;
				else terminate("failed");
			});
			child.once("close", (code, exitSignal) => {
				captureText("stdout", decoders.stdout.end());
				captureText("stderr", decoders.stderr.end());
				cleanup();
				resolve({
					status: reason || (code === 0 && !exitSignal && result ? result.status : "failed"),
					exit_code: reason ? null : (result?.exit_code ?? null),
					stdout: decodedOutput("stdout"),
					stderr: decodedOutput("stderr"),
					duration_ms: Math.round(performance.now() - started),
					signal: exitSignal,
					truncated,
				});
			});
			signal?.addEventListener("abort", abort, { once: true });
			if (signal?.aborted) abort();
			timer = setTimeout(() => terminate("timed_out"), validated.timeout);
			// Start the reader before filling stdin: an HTTP JSON envelope can exceed the pipe capacity.
			child.send({ bytes: Buffer.from(bytes), args: validated.args, env: validated.env }, (error) => {
				if (error) terminate("failed");
			});
			child.stdin.end(validated.stdin);
		} catch {
			if (child) {
				terminate("failed");
			} else {
				cleanup();
				reject(new errs.ConfigurationError("WASI execution could not start"));
			}
		}
	});
}
