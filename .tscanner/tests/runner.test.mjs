import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { assertNoSystemCodexConfig, assertTrustedAiRunner } from "../../scripts/ci/tscanner-runner.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const refusal = /cannot run in CI without the explicitly enabled trusted ShieldPM self-hosted runner/;
const login = {
	auth_mode: "chatgpt",
	OPENAI_API_KEY: null,
	tokens: { id_token: "fixture-id", access_token: "fixture-access", refresh_token: "fixture-refresh" },
};

function fixture(context) {
	const directory = fs.mkdtempSync(path.join(tmpdir(), "shieldpm-tscanner-runner-"));
	context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	const systemConfigPaths = ["config.toml", "managed_config.toml"].map((name) =>
		path.join(directory, "system-codex", name),
	);
	const root = path.join(directory, "checkout");
	const home = path.join(directory, "private-codex");
	fs.mkdirSync(root);
	fs.mkdirSync(home, { mode: 0o700 });
	const auth = path.join(home, "auth.json");
	fs.writeFileSync(auth, JSON.stringify(login), { mode: 0o600 });
	const configuration = {
		ai: { provider: "custom", command: "./.tscanner/providers/codex" },
		aiRules: { review: { mode: "agentic" } },
		files: { include: ["**/*.js"], exclude: [] },
	};
	const write = (file, content) => {
		const filename = path.join(root, file);
		fs.mkdirSync(path.dirname(filename), { recursive: true });
		fs.writeFileSync(filename, content);
	};
	write(".tscanner/config.jsonc", JSON.stringify(configuration));
	for (const name of ["tscanner.mjs", "tscanner-runner.mjs"]) {
		let implementation = fs.readFileSync(path.join(projectRoot, `scripts/ci/${name}`), "utf8");
		if (name === "tscanner-runner.mjs") {
			// Transplant only fixed system paths into the fixture namespace; retain the complete production guard logic.
			for (const [index, original] of ["/etc/codex/config.toml", "/etc/codex/managed_config.toml"].entries()) {
				assert.equal(implementation.split(JSON.stringify(original)).length - 1, 1);
				implementation = implementation.replace(
					JSON.stringify(original),
					JSON.stringify(systemConfigPaths[index]),
				);
			}
		}
		write(`scripts/ci/${name}`, implementation);
	}
	const env = {
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
	};
	const invoke = (file, args = [], changes = {}) =>
		spawnSync(process.execPath, [path.join(root, `scripts/ci/${file}`), ...args], {
			cwd: root,
			env: { ...env, ...changes },
			encoding: "utf8",
			timeout: 15_000,
		});
	return { directory, root, home, auth, configuration, write, env, invoke, systemConfigPaths };
}

test("subscription runner accepts only its explicitly enabled owner/develop push or manual context", (context) => {
	const f = fixture(context);
	assert.equal(assertTrustedAiRunner(f.env, f.root, f.systemConfigPaths), f.home);
	assert.equal(
		assertTrustedAiRunner({ ...f.env, GITHUB_EVENT_NAME: "workflow_dispatch" }, f.root, f.systemConfigPaths),
		f.home,
	);
	for (const [name, value] of Object.entries({
		CI: "",
		GITHUB_ACTIONS: "false",
		RUNNER_ENVIRONMENT: "github-hosted",
		RUNNER_OS: "Windows",
		GITHUB_REPOSITORY: "contributor/ShieldPM",
		GITHUB_REF: "refs/heads/main",
		GITHUB_ACTOR: "contributor",
		GITHUB_EVENT_NAME: "pull_request_target",
		SHIELDPM_CODEX_RUNNER_ENABLED: "false",
		SHIELDPM_TSCANNER_RUNNER_AI: "api",
	})) {
		assert.throws(
			() => assertTrustedAiRunner({ ...f.env, [name]: value }, f.root, f.systemConfigPaths),
			refusal,
			name,
		);
	}
	for (const event of ["pull_request", "schedule", "workflow_run"]) {
		assert.throws(
			() => assertTrustedAiRunner({ ...f.env, GITHUB_EVENT_NAME: event }, f.root, f.systemConfigPaths),
			refusal,
		);
	}
});

test("subscription runner refuses API authentication and endpoint environment overrides", (context) => {
	const f = fixture(context);
	for (const name of [
		"OPENAI_API_KEY",
		"CODEX_API_KEY",
		"CODEX_ACCESS_TOKEN",
		"CODEX_REFRESH_TOKEN",
		"OPENAI_BASE_URL",
		"OPENAI_API_BASE",
		"CODEX_API_PROXY_BASE_URL",
		"CODEX_BASE_URL",
		"CHATGPT_BASE_URL",
		"AZURE_OPENAI_API_KEY",
	]) {
		assert.throws(
			() => assertTrustedAiRunner({ ...f.env, [name]: "private-fixture-value" }, f.root, f.systemConfigPaths),
			/API keys, bearer tokens, or API endpoint overrides/,
		);
	}
});

test("loaded system configuration and even dangling configuration links fail closed", (context) => {
	const f = fixture(context);
	const ordinary = path.join(f.directory, "config.toml");
	const managed = path.join(f.directory, "managed_config.toml");
	assert.doesNotThrow(() => assertNoSystemCodexConfig([ordinary, managed]));
	fs.writeFileSync(ordinary, 'sandbox_mode="read-only"\n');
	assert.throws(() => assertNoSystemCodexConfig([ordinary, managed]), /must not load system Codex configuration/);
	fs.rmSync(ordinary);
	fs.symlinkSync(path.join(f.directory, "absent-config"), managed);
	assert.throws(() => assertNoSystemCodexConfig([ordinary, managed]), /must not load system Codex configuration/);
});

test("subscription runner enforces its Codex provider and hermetic project configuration", (context) => {
	const f = fixture(context);
	for (const configuration of [
		{ ...f.configuration, ai: { provider: "gemini" } },
		{ ...f.configuration, ai: { provider: "custom", command: "arbitrary-provider" } },
		{ ...f.configuration, aiRules: { review: { mode: "files" } } },
		{ ...f.configuration, aiRules: { review: { mode: "agentic", enabled: false } } },
	]) {
		f.write(".tscanner/config.jsonc", JSON.stringify(configuration));
		assert.throws(
			() => assertTrustedAiRunner(f.env, f.root, f.systemConfigPaths),
			/Codex custom provider, agentic rules/,
		);
	}
	f.write(".tscanner/config.jsonc", JSON.stringify(f.configuration));
	f.write(".codex/config.toml", "# Fixture project configuration\n");
	assert.throws(() => assertTrustedAiRunner(f.env, f.root, f.systemConfigPaths), /no project Codex configuration/);
	fs.rmSync(path.join(f.root, ".codex"), { recursive: true });
	fs.mkdirSync(path.join(f.directory, ".codex"));
	fs.writeFileSync(path.join(f.directory, ".codex/config.toml"), "# Fixture parent configuration\n");
	assert.throws(() => assertTrustedAiRunner(f.env, f.root, f.systemConfigPaths), /no project Codex configuration/);
});

test("subscription authentication must remain outside the checkout and private to the runner", (context) => {
	const f = fixture(context);
	assert.throws(
		() => assertTrustedAiRunner({ ...f.env, CODEX_HOME: "relative" }, f.root, f.systemConfigPaths),
		/absolute private/,
	);
	const checkedInHome = path.join(f.root, "codex");
	fs.mkdirSync(checkedInHome, { mode: 0o700 });
	fs.copyFileSync(f.auth, path.join(checkedInHome, "auth.json"));
	assert.throws(
		() => assertTrustedAiRunner({ ...f.env, CODEX_HOME: checkedInHome }, f.root, f.systemConfigPaths),
		/outside the checkout/,
	);
	fs.chmodSync(f.home, 0o755);
	assert.throws(() => assertTrustedAiRunner(f.env, f.root, f.systemConfigPaths), /private, runner-owned/);
	fs.chmodSync(f.home, 0o700);
	fs.chmodSync(f.auth, 0o644);
	assert.throws(() => assertTrustedAiRunner(f.env, f.root, f.systemConfigPaths), /private, runner-owned/);
	fs.chmodSync(f.auth, 0o600);
	const linkedHome = path.join(f.directory, "linked-home");
	fs.symlinkSync(f.home, linkedHome, "dir");
	assert.throws(
		() => assertTrustedAiRunner({ ...f.env, CODEX_HOME: linkedHome }, f.root, f.systemConfigPaths),
		/private, runner-owned/,
	);
	const originalAuth = path.join(f.home, "original-auth.json");
	fs.renameSync(f.auth, originalAuth);
	fs.symlinkSync(originalAuth, f.auth);
	assert.throws(() => assertTrustedAiRunner(f.env, f.root, f.systemConfigPaths), /private, runner-owned/);
});

test("malformed, oversized, API-mode, or incomplete login files fail without exposing their content", (context) => {
	const f = fixture(context);
	for (const value of [
		"private-fixture-token-not-json",
		"x".repeat(64 * 1024 + 1),
		JSON.stringify({ ...login, auth_mode: "apikey", OPENAI_API_KEY: "private-fixture-token" }),
		JSON.stringify({ ...login, tokens: { access_token: "private-fixture-token" } }),
		JSON.stringify({ ...login, OPENAI_API_KEY: "private-fixture-token" }),
	]) {
		fs.writeFileSync(f.auth, value);
		assert.throws(
			() => assertTrustedAiRunner(f.env, f.root, f.systemConfigPaths),
			(error) => {
				assert.match(error.message, /private, runner-owned ChatGPT auth.json/);
				assert.doesNotMatch(error.message, /private-fixture-token|fixture-access/);
				return true;
			},
		);
	}
});

test("preflight checks the installed CLI with forced ChatGPT file authentication and hides CLI output", (context) => {
	const f = fixture(context);
	const marker = path.join(f.directory, "login-args.json");
	const sandboxMarker = path.join(f.directory, "sandbox-probe-args.json");
	f.write(
		".tscanner/providers/codex.mjs",
		`import fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(sandboxMarker)}, JSON.stringify(process.argv.slice(2)));\nprocess.stdout.write("private-fixture-token");\nprocess.exitCode = Number(process.env.FIXTURE_SANDBOX_EXIT || 0);\n`,
	);
	const executable = path.join(f.directory, "fake codex");
	fs.writeFileSync(
		executable,
		`#!${process.execPath}\nimport fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify(process.argv.slice(2)));\nprocess.stdout.write("private-fixture-token");\nprocess.stderr.write("private-fixture-token");\nprocess.exitCode = Number(process.env.FIXTURE_LOGIN_EXIT || 0);\n`,
		{ mode: 0o700 },
	);
	const result = f.invoke("tscanner-runner.mjs", [], { SHIELDPM_TSCANNER_CODEX_CLI: executable });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /ChatGPT subscription login verified/);
	assert.doesNotMatch(`${result.stdout}${result.stderr}`, /private-fixture-token/);
	assert.deepEqual(JSON.parse(fs.readFileSync(marker, "utf8")), [
		"--config",
		'forced_login_method="chatgpt"',
		"--config",
		'model_provider="openai"',
		"--config",
		'cli_auth_credentials_store="file"',
		"login",
		"status",
	]);
	assert.deepEqual(JSON.parse(fs.readFileSync(sandboxMarker, "utf8")), ["--verify-runner-sandbox"]);
	const failed = f.invoke("tscanner-runner.mjs", [], {
		SHIELDPM_TSCANNER_CODEX_CLI: executable,
		FIXTURE_LOGIN_EXIT: "1",
	});
	assert.equal(failed.status, 1);
	assert.match(failed.stderr, /subscription login is unavailable/);
	assert.doesNotMatch(`${failed.stdout}${failed.stderr}`, /private-fixture-token/);
	const unsafeSandbox = f.invoke("tscanner-runner.mjs", [], {
		SHIELDPM_TSCANNER_CODEX_CLI: executable,
		FIXTURE_SANDBOX_EXIT: "1",
	});
	assert.equal(unsafeSandbox.status, 1);
	assert.match(unsafeSandbox.stderr, /sandbox must deny access to subscription credentials/);
	assert.doesNotMatch(`${unsafeSandbox.stdout}${unsafeSandbox.stderr}`, /private-fixture-token/);
});

test("trusted wrapper serializes native AI execution and restricts artifacts to its dedicated directory", (context) => {
	const f = fixture(context);
	const marker = path.join(f.root, "native-execution.txt");
	f.write(
		".tscanner/baseline.json",
		JSON.stringify({
			version: 1,
			sourceCommit: "a".repeat(40),
			reason: "Fixture baseline",
			entries: [],
		}),
	);
	f.write(
		".tscanner/node_modules/tscanner/dist/main.js",
		`
const fs = require("node:fs");
if (process.argv[2] === "validate") process.exit(0);
fs.writeFileSync(${JSON.stringify(marker)}, process.env.RAYON_NUM_THREADS || "missing");
const output = process.argv[process.argv.indexOf("--json-output") + 1];
fs.writeFileSync(output, JSON.stringify({files: [], summary: {
total_files: 1, cached_files: 0, scanned_files: 1, files_with_issues: 0, total_issues: 0,
errors: 0, warnings: 0, infos: 0, hints: 0, triggered_rules: 0, total_enabled_rules: 1
}}));
`,
	);
	const forbidden = f.invoke("tscanner.mjs", ["--only-ai", "--report-dir", f.home]);
	assert.equal(forbidden.status, 1);
	assert.match(forbidden.stderr, /Runner AI reports must use/);
	assert.equal(fs.existsSync(marker), false, "Reject report paths before running native code");
	const result = f.invoke("tscanner.mjs", ["--only-ai", "--report-dir", ".tscanner/reports-codex"], {
		RAYON_NUM_THREADS: "32",
	});
	assert.equal(result.status, 0, result.stderr);
	assert.equal(fs.readFileSync(marker, "utf8"), "1");
	assert.match(result.stdout, /trusted runner AI workspace review/);
	const reportDirectory = path.join(f.root, ".tscanner/reports-codex");
	assert.equal(JSON.parse(fs.readFileSync(path.join(reportDirectory, "gate-results.json"), "utf8")).passed, true);
	assert.deepEqual(JSON.parse(fs.readFileSync(f.auth, "utf8")), login);
	fs.rmSync(reportDirectory, { recursive: true });
	fs.symlinkSync(f.home, reportDirectory, "dir");
	const linked = f.invoke("tscanner.mjs", ["--only-ai", "--report-dir", ".tscanner/reports-codex"]);
	assert.equal(linked.status, 1);
	assert.match(linked.stderr, /cannot be symbolic links/);
});
