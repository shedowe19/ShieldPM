import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildRunnerConfig, verifyRunnerSandbox } from "../providers/codex.mjs";

function fixture(context) {
	const directory = fs.mkdtempSync(path.join(tmpdir(), "shieldpm-sandbox-probe-"));
	context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	const root = path.join(directory, "checkout");
	const home = path.join(directory, "authentication");
	fs.mkdirSync(path.join(root, ".tscanner"), { recursive: true });
	fs.mkdirSync(home, { mode: 0o700 });
	fs.writeFileSync(path.join(root, ".tscanner/config.jsonc"), "{}\n");
	fs.writeFileSync(path.join(home, "auth.json"), "PRIVATE_AUTH_SENTINEL", {
		mode: 0o600,
	});
	const capture = path.join(directory, "capture.json");
	const executable = path.join(directory, "fake-sandbox.mjs");
	fs.writeFileSync(
		executable,
		`#!${process.execPath}
import fs from "node:fs";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
fs.writeFileSync(process.env.FIXTURE_CAPTURE, JSON.stringify(args));
if (process.env.FIXTURE_MODE === "unsafe") {
	const command = args.slice(args.indexOf("--") + 1);
	const result = spawnSync(command[0], command.slice(1), { stdio: "inherit" });
	process.exitCode = result.status ?? 1;
} else {
	process.stdout.write("PRIVATE_PROVIDER_LOG_SENTINEL");
	process.stderr.write("PRIVATE_PROVIDER_LOG_SENTINEL");
	process.exitCode = Number(process.env.FIXTURE_EXIT || 0);
}
`,
		{ mode: 0o700 },
	);
	const options = (changes = {}) => ({
		workspaceRoot: root,
		env: {
			...process.env,
			CODEX_HOME: home,
			SHIELDPM_TSCANNER_RUNNER_AI: "chatgpt",
			SHIELDPM_TSCANNER_CODEX_CLI: executable,
			FIXTURE_CAPTURE: capture,
			...changes,
		},
	});
	return { root, home, capture, executable, options };
}

test("sandbox probe invokes only a fixed local command with the source-only permission profile", (context) => {
	const f = fixture(context);
	verifyRunnerSandbox(f.options());
	const args = JSON.parse(fs.readFileSync(f.capture, "utf8"));
	assert.deepEqual(args.slice(0, 3), ["sandbox", "--permission-profile", "shieldpm-review"]);
	assert.ok(!args.includes("exec"), "Sandbox verification must never request model inference");
	assert.ok(!args.includes("--sandbox"));
	assert.ok(!args.includes("--ignore-user-config"), "The sandbox command does not support exec-only flags");
	const configuration = args.flatMap((value, index) => (value === "--config" ? [args[index + 1]] : []));
	assert.deepEqual(configuration, buildRunnerConfig({ workspaceRoot: f.root, codexHome: f.home }));
	const policy = configuration.find((value) => value.startsWith("permissions="));
	assert.match(policy, /":root"="deny"/);
	assert.match(policy, /":minimal"="read"/);
	assert.match(policy, /network=\{ enabled=false \}/);
	assert.ok(policy.includes(`${JSON.stringify(f.home)}="deny"`));
	assert.deepEqual(fs.readdirSync(path.join(f.root, ".tscanner")), ["config.jsonc"]);
	assert.equal(fs.readFileSync(path.join(f.home, "auth.json"), "utf8"), "PRIVATE_AUTH_SENTINEL");
});

test("probe detects an unsafe sandbox that actually permits opening the authentication file", (context) => {
	const f = fixture(context);
	assert.throws(() => verifyRunnerSandbox(f.options({ FIXTURE_MODE: "unsafe" })), /sandbox verification failed/);
	assert.deepEqual(fs.readdirSync(path.join(f.root, ".tscanner")), ["config.jsonc"]);
	assert.equal(fs.readFileSync(path.join(f.home, "auth.json"), "utf8"), "PRIVATE_AUTH_SENTINEL");
});

test("missing authentication and unsupported profiles fail before a review without retaining probe files", (context) => {
	const f = fixture(context);
	assert.throws(() => verifyRunnerSandbox(f.options({ FIXTURE_EXIT: "2" })), /sandbox verification failed/);
	fs.rmSync(f.capture);
	fs.rmSync(path.join(f.home, "auth.json"));
	assert.throws(() => verifyRunnerSandbox(f.options()), /sandbox verification failed/);
	assert.equal(fs.existsSync(f.capture), false, "A missing auth file must not count as sandbox protection");
	assert.deepEqual(fs.readdirSync(path.join(f.root, ".tscanner")), ["config.jsonc"]);
});

test("sandbox verification CLI hides provider output and refuses unrelated command arguments", (context) => {
	const f = fixture(context);
	const adapter = path.resolve(".tscanner/providers/codex.mjs");
	const run = (args, changes = {}) =>
		spawnSync(process.execPath, [adapter, ...args], {
			cwd: f.root,
			env: { ...f.options().env, ...changes },
			encoding: "utf8",
			timeout: 5000,
		});
	const success = run(["--verify-runner-sandbox"]);
	assert.equal(success.status, 0, success.stderr);
	assert.equal(success.stdout, "");
	assert.equal(success.stderr, "");
	const failed = run(["--verify-runner-sandbox"], { FIXTURE_EXIT: "2" });
	assert.equal(failed.status, 1);
	assert.match(failed.stderr, /sandbox verification failed/);
	assert.doesNotMatch(`${failed.stdout}${failed.stderr}`, /PRIVATE_PROVIDER_LOG_SENTINEL|PRIVATE_AUTH_SENTINEL/);
	const invalid = run(["--verify-runner-sandbox", "unexpected"]);
	assert.equal(invalid.status, 1);
	assert.match(invalid.stderr, /invalid or oversized prompt/);
});
