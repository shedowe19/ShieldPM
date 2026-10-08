import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fingerprint, makeBaseline } from "../../scripts/ci/tscanner.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const installedModules = path.join(projectRoot, ".tscanner/node_modules");
const sourcePath = "backend/internal/example.js";
const existingSource = 'export function existing() {\n\tthrow new Error("Existing failure");\n}\n';

function scannerFixture(context) {
	const root = fs.mkdtempSync(path.join(tmpdir(), "shieldpm-tscanner-cli-"));
	context.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const hooksDirectory = path.join(root, "empty-hooks");
	fs.mkdirSync(hooksDirectory);
	const write = (file, content) => {
		const filename = path.join(root, file);
		fs.mkdirSync(path.dirname(filename), { recursive: true });
		fs.writeFileSync(filename, content);
	};
	const git = (...args) => {
		const result = spawnSync("git", ["-c", `core.hooksPath=${hooksDirectory}`, ...args], {
			cwd: root,
			encoding: "utf8",
		});
		assert.equal(result.status, 0, result.error?.message ?? result.stderr);
		return result.stdout.trim();
	};
	const environment = {
		...process.env,
		CI: "",
		GITHUB_ACTIONS: "",
		GITHUB_STEP_SUMMARY: "",
	};
	const subprocess = (script, args, extraEnvironment = {}) => {
		const result = spawnSync(process.execPath, [script, ...args], {
			cwd: root,
			encoding: "utf8",
			env: { ...environment, ...extraEnvironment },
			timeout: 30_000,
			maxBuffer: 8 * 1024 * 1024,
		});
		assert.equal(result.error, undefined, result.error?.message);
		assert.equal(result.signal, null, `Unexpected scanner signal: ${result.signal}`);
		return result;
	};
	write("scripts/ci/tscanner.mjs", fs.readFileSync(path.join(projectRoot, "scripts/ci/tscanner.mjs"), "utf8"));
	write(
		".tscanner/script-rules/architecture.mjs",
		fs.readFileSync(path.join(projectRoot, ".tscanner/script-rules/architecture.mjs"), "utf8"),
	);
	write(
		".tscanner/config.jsonc",
		JSON.stringify({
			rules: {
				builtin: {},
				regex: {},
				script: {
					"structured-backend-errors": {
						command: "node script-rules/architecture.mjs",
						message: "Use the central error factory for backend service errors.",
						severity: "error",
						include: ["backend/internal/**/*.js"],
						timeout: 10,
						options: { policy: "structured-backend-errors" },
					},
				},
			},
			aiRules: {},
			files: {
				include: ["backend/internal/**/*.js"],
				exclude: ["**/node_modules/**", ".tscanner/**"],
			},
		}),
	);
	fs.symlinkSync(
		installedModules,
		path.join(root, ".tscanner/node_modules"),
		process.platform === "win32" ? "junction" : "dir",
	);
	write(sourcePath, existingSource);
	git("init", "--initial-branch=develop");
	git("add", sourcePath);
	git("-c", "user.name=Scanner test", "-c", "user.email=scanner-test@example.invalid", "commit", "-m", "Fixture");
	const sourceCommit = git("rev-parse", "HEAD");
	const nativeReportPath = path.join(root, ".tscanner/fixture-native.json");
	const native = () => {
		const result = subprocess(path.join(root, ".tscanner/node_modules/tscanner/dist/main.js"), [
			"check",
			"--group-by",
			"file",
			"--no-cache",
			"--continue-on-error",
			"--json-output",
			nativeReportPath,
		]);
		assert.ok(fs.existsSync(nativeReportPath), result.stderr || result.stdout);
		return { ...result, report: JSON.parse(fs.readFileSync(nativeReportPath, "utf8")) };
	};
	const initial = native();
	assert.equal(initial.status, 0, initial.stderr || initial.stdout);
	assert.equal(initial.report.summary.errors, 1, "Fixture must create one real architecture finding");
	assert.equal(initial.report.summary.scan_warnings?.length ?? 0, 0, initial.stdout);
	assert.equal(initial.report.summary.scan_errors?.length ?? 0, 0, initial.stdout);
	const baseline = makeBaseline(initial.report, sourceCommit);
	write(".tscanner/baseline.json", JSON.stringify(baseline));
	const wrapper = (args = [], extraEnvironment = {}) =>
		subprocess(path.join(root, "scripts/ci/tscanner.mjs"), args, extraEnvironment);
	const nativeValidate = () =>
		subprocess(path.join(root, ".tscanner/node_modules/tscanner/dist/main.js"), ["validate"]);
	const gate = () => JSON.parse(fs.readFileSync(path.join(root, ".tscanner/reports/gate-results.json"), "utf8"));
	const report = () =>
		JSON.parse(fs.readFileSync(path.join(root, ".tscanner/reports/tscanner-results.json"), "utf8"));
	return { root, git, write, native, nativeValidate, wrapper, gate, report, baseline, sourceCommit };
}

test("real full scans retain an existing error in reports and fail after a new source violation", (context) => {
	const fixture = scannerFixture(context);
	const initial = fixture.wrapper();
	assert.equal(initial.status, 0, initial.stderr || initial.stdout);
	assert.equal(fixture.report().summary.errors, 1);
	assert.equal(fixture.gate().baselineErrors, 1);
	assert.equal(fixture.gate().newErrors, 0);
	assert.equal(fixture.gate().passed, true);
	fixture.write(sourcePath, `${existingSource}\nexport function added() {\n\tthrow new Error("New failure");\n}\n`);
	const changed = fixture.wrapper();
	assert.equal(changed.status, 1, changed.stderr || changed.stdout);
	assert.equal(fixture.report().summary.errors, 2);
	assert.equal(fixture.gate().baselineErrors, 1);
	assert.equal(fixture.gate().newErrors, 1);
	assert.equal(fixture.gate().passed, false);
});

test("real diff scans omit unchanged legacy errors and reject added baselined occurrences in every mode", (context) => {
	const fixture = scannerFixture(context);
	fixture.write(sourcePath, `${existingSource}\nexport const additional = 1;\n`);
	fixture.git("add", sourcePath);
	fixture.git(
		"-c",
		"user.name=Scanner test",
		"-c",
		"user.email=scanner-test@example.invalid",
		"commit",
		"-m",
		"Add unrelated line",
	);
	const unrelated = fixture.wrapper(["--branch", fixture.sourceCommit]);
	assert.equal(unrelated.status, 0, unrelated.stderr || unrelated.stdout);
	assert.equal(fixture.report().summary.errors, 0);
	assert.equal(fixture.gate().baselineErrors, 0);
	assert.equal(fixture.gate().newErrors, 0);
	fixture.git("reset", "--hard", fixture.sourceCommit);
	fixture.write(
		sourcePath,
		'export function existing() {\n\tthrow new Error("Existing failure");\n\tthrow new Error("Existing failure");\n}\n',
	);
	fixture.git("add", sourcePath);
	fixture.git(
		"-c",
		"user.name=Scanner test",
		"-c",
		"user.email=scanner-test@example.invalid",
		"commit",
		"-m",
		"Add identical violation",
	);
	const result = fixture.wrapper(["--branch", fixture.sourceCommit]);
	assert.equal(result.status, 1, result.stderr || result.stdout);
	assert.equal(fixture.gate().baselineErrors, 0);
	assert.equal(fixture.gate().newErrors, 1);
	const group = fixture.report().files.find((item) => item.file === sourcePath);
	assert.ok(group, "Changed source should remain in the raw report");
	assert.equal(fingerprint({ ...group.issues[0], file: group.file }), fixture.baseline.entries[0].fingerprint);
	fixture.git("reset", "--hard", fixture.sourceCommit);
	fixture.write(
		sourcePath,
		'export function existing() {\n\tthrow new Error("Existing failure");\n\tthrow new Error("Existing failure");\n}\n',
	);
	fixture.git("add", sourcePath);
	for (const mode of ["--staged", "--uncommitted"]) {
		const scoped = fixture.wrapper([mode]);
		assert.equal(scoped.status, 1, scoped.stderr || scoped.stdout);
		assert.equal(fixture.gate().baselineErrors, 0);
		assert.equal(fixture.gate().newErrors, 1);
		assert.equal(fixture.gate().passed, false);
	}
});

test("a failing real custom script is fatal even when native continue-on-error exits successfully", (context) => {
	const fixture = scannerFixture(context);
	fixture.write(
		".tscanner/script-rules/architecture.mjs",
		'process.stderr.write("Deliberate fixture script failure");\nprocess.exitCode = 1;\n',
	);
	const native = fixture.native();
	assert.equal(native.status, 0, native.stderr || native.stdout);
	assert.ok(
		native.report.summary.scan_warnings.some((warning) => warning.includes("Deliberate fixture script failure")),
	);
	const wrapped = fixture.wrapper();
	assert.equal(wrapped.status, 1, wrapped.stderr || wrapped.stdout);
	assert.equal(fixture.gate().passed, false);
	assert.ok(fixture.gate().infrastructureErrors.some((error) => error.includes("Deliberate fixture script failure")));
});

test("invalid source cannot produce a passing empty architecture report", (context) => {
	const fixture = scannerFixture(context);
	fixture.write(sourcePath, "export function broken( {\n");
	const result = fixture.wrapper();
	assert.equal(result.status, 1, result.stderr || result.stdout);
	assert.equal(fixture.gate().passed, false);
	assert.ok(
		fixture
			.gate()
			.infrastructureErrors.some((error) => error.includes("Could not parse backend/internal/example.js")),
	);
});

test("configuration validation invokes the real native validator without writing a scan report", (context) => {
	const fixture = scannerFixture(context);
	const result = fixture.wrapper(["--validate"]);
	assert.equal(result.status, 0, result.stderr || result.stdout);
	assert.equal(fs.existsSync(path.join(fixture.root, ".tscanner/reports/tscanner-results.json")), false);
});

test("configuration fields silently ignored by native validation make wrapper validation fail", (context) => {
	const fixture = scannerFixture(context);
	const config = JSON.parse(fs.readFileSync(path.join(fixture.root, ".tscanner/config.jsonc"), "utf8"));
	config.rules.builtin["max-params"] = { options: { maxParams: 8 } };
	fixture.write(".tscanner/config.jsonc", JSON.stringify(config));
	const native = fixture.nativeValidate();
	assert.equal(native.status, 0, native.stderr || native.stdout);
	assert.match(native.stdout, /Warnings:/);
	const wrapped = fixture.wrapper(["--validate"]);
	assert.equal(wrapped.status, 1, wrapped.stderr || wrapped.stdout);
	assert.match(wrapped.stderr, /Scanner configuration is invalid/);
	assert.match(wrapped.stderr, /Warnings:/);
	assert.equal(fs.existsSync(path.join(fixture.root, ".tscanner/reports/tscanner-results.json")), false);
});

test("CI refuses explicit AI review before any provider execution", (context) => {
	const fixture = scannerFixture(context);
	for (const mode of ["--include-ai", "--only-ai"]) {
		const result = fixture.wrapper([mode], { CI: "true", GITHUB_ACTIONS: "true" });
		assert.equal(result.status, 1, result.stderr || result.stdout);
		assert.match(result.stderr, /AI scans are local opt-in operations and cannot run in CI/);
		assert.equal(fs.existsSync(path.join(fixture.root, ".tscanner/reports/tscanner-results.json")), false);
	}
});
