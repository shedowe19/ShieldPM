import { fork, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// TScanner waits for provider exit before draining stdout. Keep its response within one pipe buffer.
export const MAX_OUTPUT_BYTES = 4096;
export const MAX_PROMPT_BYTES = 2 * 1024 * 1024;
const MAX_RESULT_BYTES = 16 * 1024;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const defaultSchema = fileURLToPath(new URL("codex-output.schema.json", import.meta.url));
const workerPath = fileURLToPath(new URL("codex-worker.mjs", import.meta.url));
const scopeStart =
	"## Scope\n\nYou have access to explore the codebase freely. Start by investigating these files:\n\n";
const scopeEnd = "\n\nYou may read additional files as needed to complete the analysis.";
const messages = Object.freeze({
	input: "Codex review received an invalid or oversized prompt.",
	start: "Codex CLI could not be started. Check its local installation and executable path.",
	provider: "Codex CLI failed. Check its local installation and sign-in.",
	timeout: "Codex review timed out.",
	cancelled: "Codex review was cancelled.",
	report: "Codex returned an invalid review report.",
	output: "Codex review report exceeds the safe provider output limit.",
	temporary: "Codex review could not prepare its private output file.",
});

class ReviewError extends Error {
	constructor(reason) {
		super(messages[reason]);
		this.reason = reason;
	}
}

/** Preserve the user's configured model while restricting this invocation to a read-only review. */
export function buildCodexArgs({ outputPath, schemaPath = defaultSchema } = {}) {
	if (typeof outputPath !== "string" || !outputPath || typeof schemaPath !== "string" || !schemaPath) {
		throw new ReviewError("temporary");
	}
	return [
		"exec",
		"--sandbox",
		"read-only",
		"--config",
		'approval_policy="never"',
		"--ephemeral",
		"--color",
		"never",
		"--output-schema",
		schemaPath,
		"--output-last-message",
		outputPath,
		"-",
	];
}

function exactKeys(object, expected) {
	return (
		object !== null &&
		typeof object === "object" &&
		!Array.isArray(object) &&
		Object.keys(object).length === expected.length &&
		expected.every((key) => Object.hasOwn(object, key))
	);
}

function hasControlCharacters(text) {
	for (const character of text) {
		const code = character.codePointAt(0);
		if (code < 32 || (code >= 127 && code <= 159)) return true;
	}
	return false;
}

function validFilePath(filename) {
	return (
		typeof filename === "string" &&
		filename.length > 0 &&
		filename.length <= 180 &&
		!path.posix.isAbsolute(filename) &&
		!path.win32.isAbsolute(filename) &&
		!/[\\:]/u.test(filename) &&
		!hasControlCharacters(filename) &&
		filename.split("/").every((part) => part.length > 0 && part !== "." && part !== "..")
	);
}

/** Extract the configured agentic-mode file list so native filtering cannot silently discard findings. */
export function parseScopedFiles(prompt, { platform = process.platform } = {}) {
	if (typeof prompt !== "string") throw new ReviewError("input");
	const start = prompt.indexOf(scopeStart);
	const end = prompt.indexOf(scopeEnd, start + scopeStart.length);
	if (
		start < 0 ||
		end < 0 ||
		prompt.indexOf(scopeStart, start + scopeStart.length) >= 0 ||
		prompt.indexOf(scopeEnd) !== end ||
		prompt.indexOf(scopeEnd, end + scopeEnd.length) >= 0
	) {
		throw new ReviewError("input");
	}
	const files = new Set();
	for (const line of prompt.slice(start + scopeStart.length, end).split("\n")) {
		const filename = platform === "win32" ? line.slice(2).replaceAll("\\", "/") : line.slice(2);
		if (!line.startsWith("- ") || !validFilePath(filename) || files.has(filename)) {
			throw new ReviewError("input");
		}
		files.add(filename);
	}
	if (files.size === 0) throw new ReviewError("input");
	return files;
}

function insideRoot(root, filename) {
	const relative = path.relative(root, filename);
	return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function sourceLineCount(root, filename) {
	const sourcePath = path.resolve(root, filename);
	const metadata = fs.lstatSync(sourcePath);
	if (!metadata.isFile() || metadata.size > MAX_SOURCE_BYTES || !insideRoot(root, fs.realpathSync(sourcePath))) {
		throw new ReviewError("report");
	}
	const source = fs.readFileSync(sourcePath, "utf8");
	if (!source) return 0;
	const lines = source.split("\n");
	return source.endsWith("\n") ? lines.length - 1 : lines.length;
}

/** Reject malformed provider output rather than allowing the native scanner to treat it as a clean scan. */
export function validateCodexOutput(text, { workspaceRoot = process.cwd(), allowedFiles } = {}) {
	try {
		if (typeof text !== "string" || !text.trim() || Buffer.byteLength(text) > MAX_RESULT_BYTES) {
			throw new ReviewError("report");
		}
		const report = JSON.parse(text);
		if (!exactKeys(report, ["issues"]) || !Array.isArray(report.issues) || report.issues.length > 8) {
			throw new ReviewError("report");
		}
		const root = fs.realpathSync(workspaceRoot);
		const lineCounts = new Map();
		for (const issue of report.issues) {
			if (
				!exactKeys(issue, ["file", "line", "column", "message"]) ||
				!validFilePath(issue.file) ||
				(allowedFiles !== undefined && !allowedFiles.has(issue.file)) ||
				!Number.isSafeInteger(issue.line) ||
				issue.line < 1 ||
				issue.line > 2147483647 ||
				!Number.isSafeInteger(issue.column) ||
				issue.column < 1 ||
				issue.column > 2147483647 ||
				typeof issue.message !== "string" ||
				!issue.message.trim() ||
				issue.message.length > 240 ||
				hasControlCharacters(issue.message)
			) {
				throw new ReviewError("report");
			}
			if (!lineCounts.has(issue.file)) lineCounts.set(issue.file, sourceLineCount(root, issue.file));
			if (issue.line > lineCounts.get(issue.file)) throw new ReviewError("report");
		}
		if (Buffer.byteLength(JSON.stringify(report)) + 1 > MAX_OUTPUT_BYTES) throw new ReviewError("output");
		return report;
	} catch (error) {
		if (error instanceof ReviewError) throw error;
		throw new ReviewError("report");
	}
}

function stopProcessTree(child, platform) {
	if (!child?.pid) return;
	if (platform === "win32") {
		spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
			stdio: "ignore",
			windowsHide: true,
			timeout: 2000,
		});
	} else {
		try {
			process.kill(-child.pid, "SIGKILL");
		} catch {
			child.kill("SIGKILL");
		}
	}
}

function executeCodex(prompt, options) {
	return new Promise((resolve, reject) => {
		const { cli, args, workspaceRoot, env, timeoutMs, signal, platform } = options;
		let child;
		let failure;
		let timer;
		let settled = false;
		const cancel = () => {
			failure ??= new ReviewError("cancelled");
			stopProcessTree(child, platform);
		};
		const finish = (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", cancel);
			process.removeListener("SIGINT", cancel);
			process.removeListener("SIGTERM", cancel);
			stopProcessTree(child, platform);
			if (failure || error) reject(failure || error);
			else resolve();
		};
		if (signal?.aborted) {
			reject(new ReviewError("cancelled"));
			return;
		}
		try {
			child = spawn(cli, args, {
				cwd: workspaceRoot,
				env,
				detached: platform !== "win32",
				windowsHide: true,
				// Provider logs may contain source or credentials. Only the private final-message file is consumed.
				stdio: ["pipe", "ignore", "ignore"],
				shell: false,
			});
		} catch {
			finish(new ReviewError("start"));
			return;
		}
		child.once("error", () => finish(new ReviewError("start")));
		child.once("close", (code) => finish(code === 0 ? undefined : new ReviewError("provider")));
		child.stdin.on("error", () => {
			failure ??= new ReviewError("provider");
			stopProcessTree(child, platform);
		});
		timer = setTimeout(() => {
			failure ??= new ReviewError("timeout");
			stopProcessTree(child, platform);
		}, timeoutMs);
		signal?.addEventListener("abort", cancel, { once: true });
		process.once("SIGINT", cancel);
		process.once("SIGTERM", cancel);
		child.stdin.end(prompt, "utf8");
	});
}

function readFinalMessage(filename) {
	const metadata = fs.lstatSync(filename);
	if (!metadata.isFile() || metadata.size === 0 || metadata.size > MAX_RESULT_BYTES) {
		throw new ReviewError("report");
	}
	const descriptor = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
	try {
		const opened = fs.fstatSync(descriptor);
		if (!opened.isFile() || opened.size === 0 || opened.size > MAX_RESULT_BYTES) throw new ReviewError("report");
		return fs.readFileSync(descriptor, "utf8");
	} finally {
		fs.closeSync(descriptor);
	}
}

/** Run a local authenticated CLI without exposing provider logs, retaining sessions, or invoking a shell. */
export async function executeCodexReview(
	prompt,
	{
		workspaceRoot = process.cwd(),
		env = process.env,
		platform = process.platform,
		cli = env.SHIELDPM_TSCANNER_CODEX_CLI || (platform === "win32" ? "codex.exe" : "codex"),
		timeoutMs = 160000,
		tempDirectory = os.tmpdir(),
		signal,
	} = {},
) {
	if (typeof prompt !== "string" || !prompt.trim() || Buffer.byteLength(prompt) > MAX_PROMPT_BYTES) {
		throw new ReviewError("input");
	}
	if (
		typeof cli !== "string" ||
		!cli ||
		hasControlCharacters(cli) ||
		!Number.isSafeInteger(timeoutMs) ||
		timeoutMs < 1 ||
		timeoutMs > 160000
	) {
		throw new ReviewError("start");
	}
	let temporary;
	let result;
	let failure;
	const allowedFiles = parseScopedFiles(prompt, { platform });
	try {
		temporary = fs.mkdtempSync(path.join(tempDirectory, "shieldpm-tscanner-codex-"));
		if (platform !== "win32") fs.chmodSync(temporary, 0o700);
		const outputPath = path.join(temporary, "review.json");
		fs.writeFileSync(outputPath, "", { mode: 0o600, flag: "wx" });
		await executeCodex(prompt, {
			cli,
			args: buildCodexArgs({ outputPath }),
			workspaceRoot,
			env,
			timeoutMs,
			signal,
			platform,
		});
		try {
			result = validateCodexOutput(readFinalMessage(outputPath), { workspaceRoot, allowedFiles });
		} catch (error) {
			if (error instanceof ReviewError) throw error;
			throw new ReviewError("report");
		}
	} catch (error) {
		failure = error instanceof ReviewError ? error : new ReviewError("temporary");
	} finally {
		try {
			if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
		} catch {
			failure ??= new ReviewError("temporary");
		}
	}
	if (failure) throw failure;
	return result;
}

/** A worker owns cleanup and its deadline even when the native scanner kills this adapter with SIGKILL. */
export async function runCodexReview(
	prompt,
	{
		workspaceRoot = process.cwd(),
		env = process.env,
		platform = process.platform,
		cli = env.SHIELDPM_TSCANNER_CODEX_CLI || (platform === "win32" ? "codex.exe" : "codex"),
		timeoutMs = 160000,
		tempDirectory = os.tmpdir(),
		signal,
	} = {},
) {
	if (typeof prompt !== "string" || !prompt.trim() || Buffer.byteLength(prompt) > MAX_PROMPT_BYTES) {
		throw new ReviewError("input");
	}
	const allowedFiles = parseScopedFiles(prompt, { platform });
	if (
		typeof cli !== "string" ||
		!cli ||
		hasControlCharacters(cli) ||
		!Number.isSafeInteger(timeoutMs) ||
		timeoutMs < 1 ||
		timeoutMs > 160000
	) {
		throw new ReviewError("start");
	}
	if (signal?.aborted) throw new ReviewError("cancelled");
	return new Promise((resolve, reject) => {
		let worker;
		let result;
		let failure;
		let timer;
		let settled = false;
		const cancel = () => {
			failure ??= new ReviewError("cancelled");
			if (worker?.connected) worker.send({ type: "cancel" }, () => {});
		};
		const finish = (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", cancel);
			process.removeListener("SIGINT", cancel);
			process.removeListener("SIGTERM", cancel);
			if (failure || error || !result) reject(failure || error || new ReviewError("provider"));
			else resolve(result);
		};
		try {
			worker = fork(workerPath, [], {
				cwd: workspaceRoot,
				env,
				detached: platform !== "win32",
				windowsHide: true,
				stdio: ["ignore", "ignore", "ignore", "ipc"],
				execArgv: [],
			});
		} catch {
			finish(new ReviewError("start"));
			return;
		}
		worker.once("error", () => finish(new ReviewError("start")));
		worker.once("close", (code) => finish(code === 0 ? undefined : new ReviewError("provider")));
		worker.on("message", (message) => {
			if (message?.ok === true && result === undefined) {
				try {
					result = validateCodexOutput(JSON.stringify(message.report), { workspaceRoot, allowedFiles });
				} catch (error) {
					failure ??= error instanceof ReviewError ? error : new ReviewError("report");
				}
			} else {
				const reason = Object.hasOwn(messages, message?.reason) ? message.reason : "provider";
				failure ??= new ReviewError(reason);
			}
		});
		timer = setTimeout(() => {
			failure ??= new ReviewError("timeout");
			cancel();
		}, timeoutMs + 5000);
		signal?.addEventListener("abort", cancel, { once: true });
		process.once("SIGINT", cancel);
		process.once("SIGTERM", cancel);
		worker.send(
			{ type: "review", prompt, options: { workspaceRoot, cli, timeoutMs, tempDirectory, platform } },
			() => {},
		);
	});
}

async function readPrompt(stdin) {
	const chunks = [];
	let bytes = 0;
	for await (const chunk of stdin) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		bytes += buffer.length;
		if (bytes > MAX_PROMPT_BYTES) throw new ReviewError("input");
		chunks.push(buffer);
	}
	return Buffer.concat(chunks).toString("utf8");
}

/** Custom-provider protocol: Markdown on stdin, one validated issues object on stdout. */
export async function main({
	stdin = process.stdin,
	stdout = process.stdout,
	stderr = process.stderr,
	...options
} = {}) {
	try {
		const report = await runCodexReview(await readPrompt(stdin), options);
		stdout.write(`${JSON.stringify(report)}\n`);
		return 0;
	} catch (error) {
		stderr.write(`${error instanceof ReviewError ? error.message : messages.provider}\n`);
		return 1;
	}
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
	process.exitCode = await main();
}
