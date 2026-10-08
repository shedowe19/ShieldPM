import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { makeBaseline } from "../../scripts/ci/tscanner.mjs";
import { buildCodexArgs, main, parseScopedFiles, runCodexReview, validateCodexOutput } from "../providers/codex.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const sourcePath = "backend/internal/example.js";
const prompt = `Review the source without modifying files. PRIVATE_PROMPT_SENTINEL

## Scope

You have access to explore the codebase freely. Start by investigating these files:

- ${sourcePath}

You may read additional files as needed to complete the analysis.
`;
const privateNoise = "PRIVATE_CLI_STREAM_SENTINEL";
const goodIssue = {
	file: sourcePath,
	line: 1,
	column: 1,
	message: "Validate the value before passing it to this API.",
};

function fixture(context) {
	const root = fs.mkdtempSync(path.join(tmpdir(), "shieldpm-codex-tests-"));
	context.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const write = (file, content, mode) => {
		const filename = path.join(root, file);
		fs.mkdirSync(path.dirname(filename), { recursive: true });
		fs.writeFileSync(filename, content, mode ? { mode } : undefined);
		return filename;
	};
	write(sourcePath, "export const value = 1;\nexport const next = value;\n");
	const privateDirectory = path.join(root, "private-results");
	fs.mkdirSync(privateDirectory, { mode: 0o700 });
	const capture = path.join(root, "capture.json");
	const marker = path.join(root, "grandchild-was-not-killed");
	const fakeCli = write(
		"fake executable/codex-fixture.mjs",
		`#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
const outputPath = value("--output-last-message");
const schemaPath = value("--output-schema");
let stdin = "";
for await (const chunk of process.stdin) stdin += chunk;
const capture = {
	args, stdin, cwd: process.cwd(), outputPath, schemaPath,
	directoryMode: fs.statSync(path.dirname(outputPath)).mode & 0o777,
	fileMode: fs.existsSync(outputPath) ? fs.statSync(outputPath).mode & 0o777 : null,
	schema: JSON.parse(fs.readFileSync(schemaPath, "utf8")),
};
const mode = process.env.FIXTURE_CODEX_MODE;
if (mode === "timeout") {
	const child = spawn(process.execPath, ["--input-type=module", "-e", 'import fs from "node:fs"; setTimeout(() => fs.writeFileSync(process.env.FIXTURE_MARKER, "alive"), Number(process.env.FIXTURE_CHILD_DELAY || 1000));'], { stdio: "ignore" });
	capture.grandchildPid = child.pid;
}
fs.writeFileSync(process.env.FIXTURE_CAPTURE, JSON.stringify(capture));
process.stdout.write("${privateNoise}\\n".repeat(mode === "noisy" ? 40000 : 1));
process.stderr.write("${privateNoise}\\n");
if (mode === "timeout") {
	setInterval(() => {}, 1000);
} else if (mode === "missing") {
	fs.rmSync(outputPath, { force: true });
} else {
	let text = JSON.stringify({ issues: ${JSON.stringify([goodIssue])} });
	if (mode === "empty") text = "";
	if (mode === "clean") text = JSON.stringify({ issues: [] });
	if (mode === "unscoped") text = JSON.stringify({ issues: [{ ...${JSON.stringify(goodIssue)}, file: "backend/lib/unscoped.js" }] });
	if (mode === "malformed") text = "{PRIVATE_BAD_JSON_SENTINEL";
	if (mode === "oversized") text = " ".repeat(20000) + text;
	fs.writeFileSync(outputPath, text);
	if (mode === "nonzero") process.exitCode = 23;
}
`,
		0o700,
	);
	const options = (mode = "valid") => ({
		workspaceRoot: root,
		cli: fakeCli,
		timeoutMs: 5000,
		tempDirectory: privateDirectory,
		env: {
			...process.env,
			FIXTURE_CODEX_MODE: mode,
			FIXTURE_CAPTURE: capture,
			FIXTURE_MARKER: marker,
		},
	});
	return { root, write, fakeCli, capture, marker, privateDirectory, options };
}

async function invokeMain(input, options) {
	let stdout = "";
	let stderr = "";
	const status = await main({
		...options,
		stdin: Readable.from([input]),
		stdout: {
			write: (value) => {
				stdout += value;
			},
		},
		stderr: {
			write: (value) => {
				stderr += value;
			},
		},
	});
	return { status, stdout, stderr };
}

test("Codex arguments enforce read-only noninteractive execution with schema output and stdin", () => {
	const args = buildCodexArgs({ outputPath: "/private/result.json", schemaPath: "/provider/schema.json" });
	const value = (flag) => args[args.indexOf(flag) + 1];
	assert.equal(args[0], "exec");
	assert.equal(value("--sandbox"), "read-only");
	assert.equal(value("--config"), 'approval_policy="never"');
	assert.equal(value("--color"), "never");
	assert.equal(value("--output-schema"), "/provider/schema.json");
	assert.equal(value("--output-last-message"), "/private/result.json");
	assert.ok(args.includes("--ephemeral"));
	assert.equal(args.at(-1), "-");
	assert.ok(!args.some((arg) => /full-auto|yolo|dangerously-bypass/.test(arg)));
});

test("valid Codex output retains one-based source locations and permits an empty issue list", (context) => {
	const f = fixture(context);
	assert.deepEqual(validateCodexOutput(JSON.stringify({ issues: [goodIssue] }), { workspaceRoot: f.root }), {
		issues: [goodIssue],
	});
	assert.deepEqual(validateCodexOutput('{"issues":[]}', { workspaceRoot: f.root }), { issues: [] });
});

test("native agentic scope is required, unambiguous and kept separate from explorable related files", async (context) => {
	const f = fixture(context);
	assert.deepEqual([...parseScopedFiles(prompt)], [sourcePath]);
	f.write("backend/lib/related.js", "export const value = 1;\n");
	assert.throws(() =>
		validateCodexOutput(JSON.stringify({ issues: [{ ...goodIssue, file: "backend/lib/related.js" }] }), {
			workspaceRoot: f.root,
			allowedFiles: parseScopedFiles(prompt),
		}),
	);
	for (const invalid of [
		"Review this source",
		prompt + prompt,
		prompt.replace(`- ${sourcePath}`, "- ../outside.js"),
		prompt.replace(`- ${sourcePath}`, "Nothing listed"),
	]) {
		const result = await invokeMain(invalid, f.options());
		assert.equal(result.status, 1);
		assert.equal(result.stdout, "");
		assert.equal(fs.existsSync(f.capture), false, "Malformed scope must fail before any provider starts");
	}
});

test("Codex output validation rejects malformed JSON and unexpected response shapes", (context) => {
	const f = fixture(context);
	for (const text of [
		"",
		"not JSON",
		"null",
		"[]",
		"{}",
		'{"issues":null}',
		'{"issues":{}}',
		'```json\n{"issues":[]}\n```',
		'{"issues":[],"extra":true}',
	]) {
		assert.throws(() => validateCodexOutput(text, { workspaceRoot: f.root }), Error);
	}
	assert.throws(() =>
		validateCodexOutput(JSON.stringify({ issues: [{ ...goodIssue, extra: true }] }), { workspaceRoot: f.root }),
	);
});

test("Codex output validates source paths, actual line bounds and positive integer columns", (context) => {
	const f = fixture(context);
	for (const change of [
		{ file: "../outside.js" },
		{ file: "/etc/passwd" },
		{ file: "C:\\private\\outside.js" },
		{ file: "backend/internal/missing.js" },
		{ file: "backend/internal" },
		{ line: 0 },
		{ line: -1 },
		{ line: 1.5 },
		{ line: "1" },
		{ line: 3 },
		{ column: 0 },
		{ column: -1 },
		{ column: 1.5 },
		{ column: "1" },
		{ column: 2147483648 },
		{ message: "" },
		{ message: "   " },
		{ message: null },
		{ message: "secret\nsecond line" },
	]) {
		assert.throws(
			() =>
				validateCodexOutput(JSON.stringify({ issues: [{ ...goodIssue, ...change }] }), {
					workspaceRoot: f.root,
				}),
			Error,
			JSON.stringify(change),
		);
	}
});

test("Codex output rejects symlink sources and paths escaping through a symlinked parent", (context) => {
	const f = fixture(context);
	fs.symlinkSync(path.join(f.root, sourcePath), path.join(f.root, "linked.js"));
	assert.throws(() =>
		validateCodexOutput(JSON.stringify({ issues: [{ ...goodIssue, file: "linked.js" }] }), {
			workspaceRoot: f.root,
		}),
	);
	const outside = fs.mkdtempSync(path.join(tmpdir(), "shieldpm-codex-outside-"));
	context.after(() => fs.rmSync(outside, { recursive: true, force: true }));
	fs.writeFileSync(path.join(outside, "outside.js"), "export const value = 1;\n");
	fs.symlinkSync(outside, path.join(f.root, "outside"), process.platform === "win32" ? "junction" : "dir");
	assert.throws(() =>
		validateCodexOutput(JSON.stringify({ issues: [{ ...goodIssue, file: "outside/outside.js" }] }), {
			workspaceRoot: f.root,
		}),
	);
});

test("Codex output limits findings and UTF-8 response size rather than accepting unbounded pipe output", (context) => {
	const f = fixture(context);
	for (const issues of [
		Array.from({ length: 9 }, () => goodIssue),
		Array.from({ length: 8 }, () => ({ ...goodIssue, message: "😀".repeat(120) })),
	]) {
		assert.throws(() => validateCodexOutput(JSON.stringify({ issues }), { workspaceRoot: f.root }));
	}
	assert.throws(() =>
		validateCodexOutput(JSON.stringify({ issues: [{ ...goodIssue, message: "x".repeat(241) }] }), {
			workspaceRoot: f.root,
		}),
	);
});

test("the actual fake executable receives the prompt on stdin and private schema/result arguments", {
	skip: process.platform === "win32",
}, async (context) => {
	const f = fixture(context);
	assert.deepEqual(await runCodexReview(prompt, f.options()), { issues: [goodIssue] });
	const capture = JSON.parse(fs.readFileSync(f.capture, "utf8"));
	assert.equal(capture.stdin, prompt);
	assert.equal(capture.cwd, f.root);
	assert.ok(!capture.args.some((arg) => arg.includes("PRIVATE_PROMPT_SENTINEL")));
	assert.equal(capture.directoryMode, 0o700);
	assert.equal(capture.fileMode, 0o600);
	assert.equal(capture.schema.additionalProperties, false);
	assert.equal(capture.schema.properties.issues.maxItems, 8);
	assert.deepEqual(fs.readdirSync(f.privateDirectory), []);
	assert.equal(fs.existsSync(capture.outputPath), false);
});

test("main emits only compact issue JSON despite large noisy CLI stdout and stderr", {
	skip: process.platform === "win32",
}, async (context) => {
	const f = fixture(context);
	const result = await invokeMain(prompt, f.options("noisy"));
	assert.equal(result.status, 0);
	assert.equal(result.stdout, `${JSON.stringify({ issues: [goodIssue] })}\n`);
	assert.equal(result.stderr, "");
	assert.ok(!result.stdout.includes(privateNoise));
	assert.ok(Buffer.byteLength(result.stdout) <= 4096);
	assert.deepEqual(fs.readdirSync(f.privateDirectory), []);
});

test("malformed, missing, empty, oversized and failed CLI results fail without leaking provider output", {
	skip: process.platform === "win32",
}, async (context) => {
	const f = fixture(context);
	for (const mode of ["malformed", "missing", "empty", "oversized", "nonzero"]) {
		const result = await invokeMain(prompt, f.options(mode));
		assert.equal(result.status, 1, mode);
		assert.equal(result.stdout, "", mode);
		assert.ok(result.stderr.length > 0 && result.stderr.length < 500, mode);
		assert.ok(!result.stderr.includes(privateNoise), mode);
		assert.ok(!result.stderr.includes("PRIVATE_BAD_JSON_SENTINEL"), mode);
		assert.ok(!result.stderr.includes("PRIVATE_PROMPT_SENTINEL"), mode);
		assert.deepEqual(fs.readdirSync(f.privateDirectory), [], mode);
	}
});

test("a missing Codex executable produces a fixed diagnostic and cleans private temporary output", async (context) => {
	const f = fixture(context);
	const result = await invokeMain(prompt, { ...f.options(), cli: path.join(f.root, "PRIVATE_MISSING_CLI_SENTINEL") });
	assert.equal(result.status, 1);
	assert.equal(result.stdout, "");
	assert.ok(result.stderr.length > 0 && result.stderr.length < 500);
	assert.ok(!result.stderr.includes("PRIVATE_MISSING_CLI_SENTINEL"));
	assert.deepEqual(fs.readdirSync(f.privateDirectory), []);
});

test("empty and oversized prompts fail before provider execution or private output creation", async (context) => {
	const f = fixture(context);
	for (const input of ["", " \n\t", prompt + "x".repeat(2 * 1024 * 1024)]) {
		const result = await invokeMain(input, f.options());
		assert.equal(result.status, 1);
		assert.equal(result.stdout, "");
		assert.ok(!result.stderr.includes("PRIVATE_PROMPT_SENTINEL"));
		assert.equal(fs.existsSync(f.capture), false);
		assert.deepEqual(fs.readdirSync(f.privateDirectory), []);
	}
});

test("timeout terminates the provider process group including a spawned grandchild", {
	skip: process.platform === "win32",
}, async (context) => {
	const f = fixture(context);
	const options = f.options("timeout");
	const result = await invokeMain(prompt, {
		...options,
		timeoutMs: 2000,
		env: { ...options.env, FIXTURE_CHILD_DELAY: "3000" },
	});
	assert.equal(result.status, 1);
	assert.equal(result.stdout, "");
	const capture = JSON.parse(fs.readFileSync(f.capture, "utf8"));
	assert.ok(Number.isInteger(capture.grandchildPid));
	await new Promise((resolve) => setTimeout(resolve, 1100));
	assert.equal(fs.existsSync(f.marker), false, "Timed-out grandchildren must not continue after the review");
	assert.deepEqual(fs.readdirSync(f.privateDirectory), []);
});

test("an already cancelled review does not launch a provider", async (context) => {
	const f = fixture(context);
	const controller = new AbortController();
	controller.abort();
	const result = await invokeMain(prompt, { ...f.options(), signal: controller.signal });
	assert.equal(result.status, 1);
	assert.equal(result.stdout, "");
	assert.equal(fs.existsSync(f.capture), false);
	assert.deepEqual(fs.readdirSync(f.privateDirectory), []);
});

test("killing the adapter parent still terminates Codex descendants and removes private results", {
	skip: process.platform === "win32",
}, async (context) => {
	const f = fixture(context);
	const adapter = spawn(process.execPath, [path.join(projectRoot, ".tscanner/providers/codex.mjs")], {
		cwd: f.root,
		stdio: ["pipe", "ignore", "ignore"],
		env: { ...f.options("timeout").env, SHIELDPM_TSCANNER_CODEX_CLI: f.fakeCli, TMPDIR: f.privateDirectory },
	});
	context.after(() => adapter.kill("SIGKILL"));
	adapter.stdin.end(prompt);
	const deadline = Date.now() + 4000;
	while (!fs.existsSync(f.capture) && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	assert.ok(fs.existsSync(f.capture), "The fake provider must be running before its parent is killed");
	const capture = JSON.parse(fs.readFileSync(f.capture, "utf8"));
	assert.ok(Number.isInteger(capture.grandchildPid));
	const closed = once(adapter, "close");
	adapter.kill("SIGKILL");
	await closed;
	await new Promise((resolve) => setTimeout(resolve, 1200));
	assert.equal(fs.existsSync(f.marker), false, "Provider descendants must stop when the adapter is killed");
	assert.deepEqual(
		fs.readdirSync(f.privateDirectory),
		[],
		"Supervisor must remove private output after parent death",
	);
});

test("native TScanner uses the relative executable custom provider and wrapper propagates its failure", {
	skip: process.platform === "win32",
}, (context) => {
	const f = fixture(context);
	const providers = path.join(projectRoot, ".tscanner/providers");
	assert.ok(fs.statSync(path.join(providers, "codex")).mode & 0o111, "Tracked POSIX provider must be executable");
	fs.cpSync(providers, path.join(f.root, ".tscanner/providers"), { recursive: true });
	fs.symlinkSync(
		path.join(projectRoot, ".tscanner/node_modules"),
		path.join(f.root, ".tscanner/node_modules"),
		"dir",
	);
	f.write("scripts/ci/tscanner.mjs", fs.readFileSync(path.join(projectRoot, "scripts/ci/tscanner.mjs"), "utf8"));
	f.write(".tscanner/ai-rules/review.md", "Review these files for a concrete security problem:\n\n{{FILES}}\n");
	f.write("backend/lib/unscoped.js", "export const value = 1;\n");
	f.write(
		".tscanner/config.jsonc",
		JSON.stringify({
			rules: { builtin: {}, regex: {}, script: {} },
			aiRules: {
				"fixture-review": {
					prompt: "review.md",
					mode: "agentic",
					message: "Review finding",
					severity: "warning",
					include: ["backend/internal/**/*.js"],
					timeout: 10,
				},
			},
			ai: { provider: "custom", command: "./.tscanner/providers/codex" },
			files: { include: ["backend/internal/**/*.js"], exclude: ["**/node_modules/**", ".tscanner/**"] },
		}),
	);
	const hooksDirectory = path.join(f.root, "empty-hooks");
	fs.mkdirSync(hooksDirectory);
	const git = (...args) => {
		const result = spawnSync("git", ["-c", `core.hooksPath=${hooksDirectory}`, ...args], {
			cwd: f.root,
			encoding: "utf8",
		});
		assert.equal(result.status, 0, result.error?.message ?? result.stderr);
		return result.stdout.trim();
	};
	git("init", "--initial-branch=develop");
	git("add", sourcePath);
	git("-c", "user.name=Scanner test", "-c", "user.email=scanner-test@example.invalid", "commit", "-m", "Fixture");
	f.write(
		".tscanner/baseline.json",
		JSON.stringify(
			makeBaseline(
				{
					files: [],
					summary: {
						total_files: 1,
						cached_files: 0,
						scanned_files: 1,
						files_with_issues: 0,
						total_issues: 0,
						errors: 0,
						warnings: 0,
						infos: 0,
						hints: 0,
						triggered_rules: 0,
						total_enabled_rules: 1,
					},
				},
				git("rev-parse", "HEAD"),
			),
		),
	);
	const runWrapper = (mode) => {
		const result = spawnSync(process.execPath, [path.join(f.root, "scripts/ci/tscanner.mjs"), "--only-ai"], {
			cwd: f.root,
			encoding: "utf8",
			timeout: 20_000,
			maxBuffer: 2 * 1024 * 1024,
			env: {
				...f.options(mode).env,
				SHIELDPM_TSCANNER_CODEX_CLI: f.fakeCli,
				CI: "",
				GITHUB_ACTIONS: "",
				GITHUB_STEP_SUMMARY: "",
			},
		});
		assert.equal(result.error, undefined, result.error?.message);
		const report = JSON.parse(
			fs.readFileSync(path.join(f.root, ".tscanner/reports/tscanner-results.json"), "utf8"),
		);
		const gate = JSON.parse(fs.readFileSync(path.join(f.root, ".tscanner/reports/gate-results.json"), "utf8"));
		return { ...result, report, gate };
	};
	const valid = runWrapper("valid");
	assert.equal(valid.status, 0, valid.stderr || valid.stdout);
	assert.equal(valid.report.summary.warnings, 1);
	assert.equal(valid.gate.passed, true);
	assert.equal(valid.report.files[0].issues[0].message, goodIssue.message);
	assert.ok(JSON.parse(fs.readFileSync(f.capture, "utf8")).stdin.includes(sourcePath));
	assert.ok(!`${valid.stdout}${valid.stderr}`.includes(privateNoise));
	const failed = runWrapper("malformed");
	assert.equal(failed.status, 1, failed.stderr || failed.stdout);
	assert.equal(failed.gate.passed, false);
	assert.ok(failed.gate.infrastructureErrors.length > 0);
	assert.ok(!JSON.stringify(failed.report).includes("PRIVATE_BAD_JSON_SENTINEL"));
	assert.ok(!`${failed.stdout}${failed.stderr}`.includes(privateNoise));
	const unscoped = runWrapper("unscoped");
	assert.equal(unscoped.status, 1, "Existing files outside the per-rule scope must not become a false clean scan");
	assert.equal(unscoped.gate.passed, false);
	assert.ok(unscoped.gate.infrastructureErrors.length > 0);
});
