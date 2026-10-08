import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

test("authorized subscription runner uses the native scanner, serializes three Codex rules, and preserves source/auth", {
	skip: process.platform !== "linux",
}, (context) => {
	const directory = fs.mkdtempSync(path.join(tmpdir(), "shieldpm-native-runner-"));
	context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	const root = path.join(directory, "checkout");
	const home = path.join(directory, "private-codex");
	fs.mkdirSync(root);
	fs.mkdirSync(home, { mode: 0o700 });
	const authentication = JSON.stringify({
		auth_mode: "chatgpt",
		OPENAI_API_KEY: null,
		tokens: { id_token: "fixture-id", access_token: "fixture-access", refresh_token: "fixture-refresh" },
	});
	const auth = path.join(home, "auth.json");
	fs.writeFileSync(auth, authentication, { mode: 0o600 });
	const write = (file, content) => {
		const filename = path.join(root, file);
		fs.mkdirSync(path.dirname(filename), { recursive: true });
		fs.writeFileSync(filename, content);
	};
	for (const name of ["tscanner.mjs", "tscanner-runner.mjs"]) {
		let implementation = fs.readFileSync(path.join(projectRoot, `scripts/ci/${name}`), "utf8");
		if (name === "tscanner-runner.mjs") {
			// Transplant fixed system paths into the fixture namespace, leaving host configuration and guard logic intact.
			for (const original of ["/etc/codex/config.toml", "/etc/codex/managed_config.toml"]) {
				assert.equal(implementation.split(JSON.stringify(original)).length - 1, 1);
				implementation = implementation.replace(
					JSON.stringify(original),
					JSON.stringify(path.join(directory, "system-codex", path.basename(original))),
				);
			}
		}
		write(`scripts/ci/${name}`, implementation);
	}
	fs.cpSync(path.join(projectRoot, ".tscanner/providers"), path.join(root, ".tscanner/providers"), {
		recursive: true,
	});
	fs.symlinkSync(path.join(projectRoot, ".tscanner/node_modules"), path.join(root, ".tscanner/node_modules"), "dir");
	const sourcePath = "backend/internal/example.js";
	const source = "export const value = 1;\n";
	write(sourcePath, source);
	const aiRules = {};
	for (const name of ["security", "architecture", "performance"]) {
		write(`.tscanner/ai-rules/${name}.md`, `Review ${name} without changing the source:\n\n{{FILES}}\n`);
		aiRules[`fixture-${name}`] = {
			prompt: `${name}.md`,
			mode: "agentic",
			message: `Fixture ${name} finding`,
			severity: "warning",
			include: ["backend/internal/**/*.js"],
			timeout: 10,
		};
	}
	write(
		".tscanner/config.jsonc",
		JSON.stringify({
			rules: { builtin: {}, regex: {}, script: {} },
			aiRules,
			ai: { provider: "custom", command: "./.tscanner/providers/codex" },
			files: { include: ["backend/internal/**/*.js"], exclude: ["**/node_modules/**", ".tscanner/**"] },
		}),
	);
	write(
		".tscanner/baseline.json",
		JSON.stringify({
			version: 1,
			sourceCommit: "a".repeat(40),
			reason: "Fixture baseline",
			entries: [],
		}),
	);
	const git = spawnSync("git", ["init", "--initial-branch=develop"], { cwd: root, encoding: "utf8" });
	assert.equal(git.status, 0, git.stderr);
	const capture = path.join(directory, "codex-executions.jsonl");
	const exclusive = path.join(directory, "subscription-session.lock");
	const executable = path.join(directory, "fake codex.mjs");
	fs.writeFileSync(
		executable,
		`#!${process.execPath}
import fs from "node:fs";
const lock = ${JSON.stringify(exclusive)};
let descriptor;
try { descriptor = fs.openSync(lock, "wx", 0o600); }
catch { process.stderr.write("FIXTURE_CONCURRENT_LOGIN_FAILURE"); process.exit(23); }
const args = process.argv.slice(2);
let stdin = "";
for await (const chunk of process.stdin) stdin += chunk;
await new Promise((resolve) => setTimeout(resolve, 150));
fs.appendFileSync(${JSON.stringify(capture)}, JSON.stringify({args, stdin, cwd: process.cwd()}) + "\\n");
fs.writeFileSync(args[args.indexOf("--output-last-message") + 1], JSON.stringify({issues: [{
file: ${JSON.stringify(sourcePath)}, line: 1, column: 1, message: "Validate this fixture value before use."
}]}));
process.stdout.write("PRIVATE_FIXTURE_PROVIDER_OUTPUT");
process.stderr.write("PRIVATE_FIXTURE_PROVIDER_OUTPUT");
fs.closeSync(descriptor);
fs.rmSync(lock);
`,
		{ mode: 0o700 },
	);
	const environment = {
		...process.env,
		CI: "true",
		GITHUB_ACTIONS: "true",
		RUNNER_ENVIRONMENT: "self-hosted",
		RUNNER_OS: "Linux",
		GITHUB_REPOSITORY: "shedowe19/ShieldPM",
		GITHUB_REF: "refs/heads/develop",
		GITHUB_ACTOR: "shedowe19",
		GITHUB_EVENT_NAME: "push",
		SHIELDPM_CODEX_RUNNER_ENABLED: "true",
		SHIELDPM_TSCANNER_RUNNER_AI: "chatgpt",
		SHIELDPM_TSCANNER_CODEX_CLI: executable,
		CODEX_HOME: home,
		OPENAI_API_KEY: "",
		CODEX_API_KEY: "",
		CODEX_ACCESS_TOKEN: "",
		CODEX_REFRESH_TOKEN: "",
		OPENAI_BASE_URL: "",
		OPENAI_API_BASE: "",
		CODEX_API_PROXY_BASE_URL: "",
		CODEX_BASE_URL: "",
		CHATGPT_BASE_URL: "",
		AZURE_OPENAI_API_KEY: "",
		GITHUB_STEP_SUMMARY: "",
		RAYON_NUM_THREADS: "32",
	};
	const run = (changes = {}) =>
		spawnSync(
			process.execPath,
			[path.join(root, "scripts/ci/tscanner.mjs"), "--only-ai", "--report-dir", ".tscanner/reports-codex"],
			{ cwd: root, env: { ...environment, ...changes }, encoding: "utf8", timeout: 30_000 },
		);
	const rejected = run({ OPENAI_API_KEY: "PRIVATE_FIXTURE_API_KEY" });
	assert.equal(rejected.status, 1);
	assert.match(rejected.stderr, /cannot use API keys/);
	assert.doesNotMatch(`${rejected.stdout}${rejected.stderr}`, /PRIVATE_FIXTURE_API_KEY/);
	assert.equal(fs.existsSync(capture), false, "API credentials fail before any Codex executable is started");
	const reports = path.join(root, ".tscanner/reports-codex");
	fs.mkdirSync(reports);
	for (const name of ["summary.md", "gate-results.json"]) fs.symlinkSync(auth, path.join(reports, name));
	fs.writeFileSync(path.join(reports, "stale-output.txt"), "Old review output");
	const reviewed = run();
	assert.equal(reviewed.status, 0, reviewed.stderr || reviewed.stdout);
	assert.doesNotMatch(
		`${reviewed.stdout}${reviewed.stderr}`,
		/PRIVATE_FIXTURE_PROVIDER_OUTPUT|FIXTURE_CONCURRENT_LOGIN_FAILURE/,
	);
	const invocations = fs
		.readFileSync(capture, "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
	assert.equal(invocations.length, 3, "All native AI rules must run without overlapping authentication");
	for (const { args, stdin, cwd } of invocations) {
		assert.equal(cwd, root);
		assert.ok(stdin.includes(`- ${sourcePath}`));
		assert.ok(args.includes("--ignore-user-config"));
		assert.ok(args.includes("--ignore-rules"));
		assert.ok(!args.includes("--sandbox"), "Use the protected named profile instead of legacy sandbox defaults");
		const settings = args.flatMap((argument, index) => (argument === "--config" ? [args[index + 1]] : []));
		assert.ok(settings.includes('forced_login_method="chatgpt"'));
		assert.ok(settings.includes('default_permissions="shieldpm-review"'));
		assert.ok(settings.some((setting) => setting.includes(`${JSON.stringify(home)}="deny"`)));
	}
	const report = JSON.parse(fs.readFileSync(path.join(reports, "tscanner-results.json"), "utf8"));
	assert.equal(report.summary.warnings, 3);
	assert.deepEqual(report.summary.scan_warnings ?? [], []);
	assert.deepEqual(report.summary.scan_errors ?? [], []);
	assert.equal(JSON.parse(fs.readFileSync(path.join(reports, "gate-results.json"), "utf8")).passed, true);
	assert.equal(fs.lstatSync(path.join(reports, "summary.md")).isSymbolicLink(), false);
	assert.equal(fs.lstatSync(path.join(reports, "gate-results.json")).isSymbolicLink(), false);
	assert.equal(fs.existsSync(path.join(reports, "stale-output.txt")), false);
	assert.equal(fs.readFileSync(path.join(root, sourcePath), "utf8"), source);
	assert.equal(fs.readFileSync(auth, "utf8"), authentication);
	assert.equal(fs.existsSync(exclusive), false);
});
