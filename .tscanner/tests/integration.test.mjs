import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
	evaluateReport,
	fingerprint,
	flattenReport,
	makeBaseline,
	parseArguments,
	summaryMarkdown,
	validateBaseline,
	validateDiffScope,
} from "../../scripts/ci/tscanner.mjs";

function finding(overrides = {}) {
	return {
		file: "backend/internal/example.js",
		rule: "structured-backend-errors",
		message: "Use the structured backend error factory.",
		severity: "error",
		line: 4,
		column: 1,
		line_text: '\tthrow new Error("Existing failure");',
		...overrides,
	};
}

function rawReport(issues = []) {
	const groups = new Map();
	for (const issue of issues) {
		const { file, ...fields } = issue;
		const group = groups.get(file) ?? { file, issues: [] };
		group.issues.push(fields);
		groups.set(file, group);
	}
	const severityCount = (severity) => issues.filter((issue) => issue.severity === severity).length;
	return {
		files: [...groups.values()],
		summary: {
			total_files: groups.size,
			cached_files: 0,
			scanned_files: groups.size,
			files_with_issues: groups.size,
			total_issues: issues.length,
			errors: severityCount("error"),
			warnings: severityCount("warning"),
			infos: severityCount("info"),
			hints: severityCount("hint"),
			triggered_rules: new Set(issues.map((issue) => issue.rule)).size,
			total_enabled_rules: 4,
			duration_ms: 1,
		},
	};
}

function emptyBaseline() {
	return makeBaseline(rawReport(), "a".repeat(40));
}

const scopeConfiguration = {
	files: {
		include: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx", "**/*.mjs", "**/*.cjs"],
		exclude: ["docs/**", "**/tests/**", "**/*.test.*", "**/node_modules/**", ".tscanner/**"],
	},
};

function gitFixture(context) {
	const directory = fs.mkdtempSync(path.join(tmpdir(), "shieldpm-tscanner-scope-"));
	context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	const hooksDirectory = path.join(directory, "empty-hooks");
	fs.mkdirSync(hooksDirectory);
	const git = (...args) => {
		const result = spawnSync("git", ["-c", `core.hooksPath=${hooksDirectory}`, ...args], {
			cwd: directory,
			encoding: "utf8",
		});
		assert.equal(result.status, 0, result.error?.message ?? result.stderr);
		return result.stdout;
	};
	const write = (file, content = "export const value = 1;\n") => {
		const filename = path.join(directory, file);
		fs.mkdirSync(path.dirname(filename), { recursive: true });
		fs.writeFileSync(filename, content);
	};
	git("init", "--initial-branch=develop");
	write("backend/internal/example.js");
	write("backend/internal/unrelated.js");
	git("add", ".");
	git("-c", "user.name=Scanner test", "-c", "user.email=scanner-test@example.invalid", "commit", "-m", "Fixture");
	return { directory, git, write };
}

test("staged scans reject partially staged source because the native CLI reads working files", (context) => {
	const fixture = gitFixture(context);
	fixture.write("backend/internal/example.js", "export const value = 2;\n");
	fixture.git("add", "backend/internal/example.js");
	fixture.write("backend/internal/example.js", "export const value = 3;\n");
	assert.throws(() => validateDiffScope({ staged: true }, fixture.directory, scopeConfiguration));
});

test("staged scans allow fully staged sources despite unrelated unstaged or untracked source", (context) => {
	const fixture = gitFixture(context);
	fixture.write("backend/internal/example.js", "export const value = 2;\n");
	fixture.git("add", "backend/internal/example.js");
	fixture.write("backend/internal/unrelated.js", "export const value = 3;\n");
	fixture.write("backend/internal/new.js");
	assert.doesNotThrow(() => validateDiffScope({ staged: true }, fixture.directory, scopeConfiguration));
});

test("staged scope checks preserve filenames containing spaces and Unicode", (context) => {
	const fixture = gitFixture(context);
	const file = "frontend/src/pages/Überblick panel.tsx";
	fixture.write(file, "export const value = 1;\n");
	fixture.git("add", file);
	fixture.write(file, "export const value = 2;\n");
	assert.throws(() => validateDiffScope({ staged: true }, fixture.directory, scopeConfiguration));
});

test("leading filename whitespace cannot turn a scannable source into an excluded path", (context) => {
	const fixture = gitFixture(context);
	const file = " .tscanner/source.js";
	fixture.write(file);
	assert.throws(() => validateDiffScope({ uncommitted: true }, fixture.directory, scopeConfiguration));
	fixture.git("add", file);
	fixture.write(file, "export const value = 2;\n");
	assert.throws(() => validateDiffScope({ staged: true }, fixture.directory, scopeConfiguration));
});

test("uncommitted scans reject untracked source rather than silently omitting it", (context) => {
	const fixture = gitFixture(context);
	fixture.write("frontend/src/pages/New.tsx");
	assert.throws(() => validateDiffScope({ uncommitted: true }, fixture.directory, scopeConfiguration));
});

test("uncommitted scans allow ordinary modified tracked source", (context) => {
	const fixture = gitFixture(context);
	fixture.write("backend/internal/example.js", "export const value = 2;\n");
	assert.doesNotThrow(() => validateDiffScope({ uncommitted: true }, fixture.directory, scopeConfiguration));
	fixture.git("add", "backend/internal/example.js");
	assert.doesNotThrow(() => validateDiffScope({ uncommitted: true }, fixture.directory, scopeConfiguration));
});

test("scope checks honor excludes for docs, tests, dependencies and scanner files", (context) => {
	const fixture = gitFixture(context);
	const excluded = [
		"docs/example.js",
		"backend/tests/example.js",
		"frontend/src/Example.test.tsx",
		"frontend/node_modules/package/example.js",
		".tscanner/script-rules/example.mjs",
	];
	for (const file of excluded) fixture.write(file);
	assert.doesNotThrow(() => validateDiffScope({ uncommitted: true }, fixture.directory, scopeConfiguration));
	fixture.git("add", ...excluded);
	for (const file of excluded) fixture.write(file, "export const value = 2;\n");
	assert.doesNotThrow(() => validateDiffScope({ staged: true }, fixture.directory, scopeConfiguration));
});

test("full-workspace scope permits new sources since full scans include the working tree", (context) => {
	const fixture = gitFixture(context);
	fixture.write("frontend/src/pages/New.tsx");
	assert.doesNotThrow(() => validateDiffScope({}, fixture.directory, scopeConfiguration));
});

test("argument parsing provides full-scan defaults and preserves explicit comparison references", () => {
	assert.deepEqual(parseArguments([]), { reportDirectory: ".tscanner/reports" });
	assert.deepEqual(parseArguments(["--branch", "origin/develop", "--report-dir", "results"]), {
		reportDirectory: "results",
		branch: "origin/develop",
	});
	assert.equal(parseArguments(["--staged"]).staged, true);
	assert.equal(parseArguments(["--uncommitted"]).uncommitted, true);
	assert.equal(parseArguments(["--only-ai"])["only-ai"], true);
	assert.equal(parseArguments(["--include-ai"])["include-ai"], true);
});

test("argument parsing rejects conflicting diff modes and missing or unknown arguments", () => {
	for (const args of [
		["--branch", "develop", "--staged"],
		["--branch", "develop", "--uncommitted"],
		["--staged", "--uncommitted"],
		["--only-ai", "--include-ai"],
		["--branch"],
		["--report-dir", "--staged"],
		["--unknown"],
	]) {
		assert.throws(() => parseArguments(args), Error, args.join(" "));
	}
});

test("AI review cannot promise staged or changed-line scope when upstream scans the full workspace", () => {
	for (const aiMode of ["--include-ai", "--only-ai"]) {
		for (const scope of [["--branch", "origin/develop"], ["--staged"], ["--uncommitted"]]) {
			assert.throws(() => parseArguments([aiMode, ...scope]), /AI scans review the full workspace/);
		}
	}
});

test("baseline updates require a full deterministic scan and validation cannot launch another mode", () => {
	assert.equal(parseArguments(["--update-baseline"])["update-baseline"], true);
	assert.equal(parseArguments(["--validate", "--report-dir", "results"]).validate, true);
	for (const args of [
		["--update-baseline", "--branch", "develop"],
		["--update-baseline", "--staged"],
		["--update-baseline", "--uncommitted"],
		["--update-baseline", "--only-ai"],
		["--update-baseline", "--include-ai"],
		["--validate", "--staged"],
		["--validate", "--only-ai"],
		["--validate", "--update-baseline"],
	]) {
		assert.throws(() => parseArguments(args), Error, args.join(" "));
	}
});

test("report flattening keeps file associations and normalizes Windows separators", () => {
	const issue = finding({ file: "frontend\\src\\Example.tsx", severity: "warning" });
	assert.deepEqual(flattenReport(rawReport([issue])), [{ ...issue, file: "frontend/src/Example.tsx" }]);
	assert.deepEqual(flattenReport(rawReport()), []);
});

test("report parsing fails closed on malformed groups and issue locations", () => {
	for (const report of [null, {}, { files: [], summary: null }, { files: {}, summary: {} }]) {
		assert.throws(() => flattenReport(report));
	}
	for (const issue of [
		finding({ line: 0 }),
		finding({ line: -1 }),
		finding({ line: 1.5 }),
		finding({ line: "4" }),
		finding({ severity: "fatal" }),
		finding({ message: null }),
		finding({ rule: 42 }),
	]) {
		assert.throws(() => flattenReport(rawReport([issue])));
	}
	const malformedGroup = rawReport([finding()]);
	malformedGroup.files[0].issues = null;
	assert.throws(() => flattenReport(malformedGroup));
});

test("report paths cannot escape the repository on either supported operating system", () => {
	for (const file of [
		"/etc/passwd",
		"backend/../outside.js",
		"backend\\..\\outside.js",
		"C:\\private\\outside.js",
		"C:/private/outside.js",
		"\\\\server\\share\\outside.js",
	]) {
		assert.throws(() => flattenReport(rawReport([finding({ file })])), Error, file);
	}
});

test("report severity counters must match findings and file counters must be valid", () => {
	const original = rawReport([
		finding(),
		finding({ severity: "warning", line: 5 }),
		finding({ severity: "info", line: 6 }),
		finding({ severity: "hint", line: 7 }),
	]);
	for (const field of ["total_issues", "errors", "warnings", "infos", "hints"]) {
		for (const value of ["1", -1, 1.5, original.summary[field] + 1]) {
			const malformed = structuredClone(original);
			malformed.summary[field] = value;
			assert.throws(() => flattenReport(malformed), Error, `${field}=${value}`);
		}
	}
	for (const value of ["1", -1, 1.5, 0]) {
		const malformed = structuredClone(original);
		malformed.summary.total_files = value;
		assert.throws(() => flattenReport(malformed), Error, `total_files=${value}`);
	}
});

test("scanner diagnostics must be arrays of strings and remain fatal with no findings", () => {
	for (const key of ["scan_warnings", "scan_errors"]) {
		for (const value of ["failure", [null], [1], { message: "failure" }]) {
			const malformed = rawReport();
			malformed.summary[key] = value;
			assert.throws(() => evaluateReport(malformed, emptyBaseline()), Error, key);
		}
		const report = rawReport();
		report.summary[key] = ["Architecture script failed to parse a source file"];
		const evaluation = evaluateReport(report, emptyBaseline());
		assert.equal(evaluation.passed, false);
		assert.equal(evaluation.newErrors.length, 0);
		assert.deepEqual(evaluation.infrastructureErrors, report.summary[key]);
	}
});

test("fingerprints follow source identity rather than line shifts or outer indentation", () => {
	const original = finding();
	const moved = finding({ line: 99, column: 8, line_text: original.line_text.trim() });
	assert.match(fingerprint(original), /^[a-f0-9]{64}$/);
	assert.equal(fingerprint(original), fingerprint(moved));
	for (const changed of [
		finding({ file: "backend/internal/other.js" }),
		finding({ rule: "different-rule" }),
		finding({ message: "A different finding" }),
		finding({ line_text: 'throw new Error("New failure");' }),
	]) {
		assert.notEqual(fingerprint(original), fingerprint(changed));
	}
	for (const line_text of [undefined, null, "", " \t "]) {
		assert.equal(fingerprint(finding({ line_text })), null);
	}
});

test("baseline creation records only errors with readable source context and occurrence counts", () => {
	const error = finding();
	const baseline = makeBaseline(
		rawReport([error, finding({ line: 12 }), finding({ severity: "warning", line: 13 })]),
		"b".repeat(40),
	);
	assert.equal(validateBaseline(baseline), baseline);
	assert.equal(baseline.version, 1);
	assert.equal(baseline.sourceCommit, "b".repeat(40));
	assert.deepEqual(baseline.entries, [
		{
			fingerprint: fingerprint(error),
			count: 2,
			file: error.file,
			rule: error.rule,
			message: error.message,
			lineText: error.line_text.trim(),
		},
	]);
	assert.throws(() => makeBaseline(rawReport([finding({ line_text: "" })]), "b".repeat(40)));
});

test("baseline validation rejects stale formats, duplicate identities and invalid occurrence allowances", () => {
	const baseline = makeBaseline(rawReport([finding()]), "c".repeat(40));
	for (const malformed of [null, {}, { version: 2, entries: [] }, { version: 1, entries: {} }]) {
		assert.throws(() => validateBaseline(malformed));
	}
	for (const count of [0, -1, 1.5, "1"]) {
		const malformed = structuredClone(baseline);
		malformed.entries[0].count = count;
		assert.throws(() => validateBaseline(malformed));
	}
	const invalidFingerprint = structuredClone(baseline);
	invalidFingerprint.entries[0].fingerprint = "not-a-source-fingerprint";
	assert.throws(() => validateBaseline(invalidFingerprint));
	const duplicate = structuredClone(baseline);
	duplicate.entries.push({ ...duplicate.entries[0] });
	assert.throws(() => validateBaseline(duplicate));
});

test("baseline validation requires a real source commit and complete readable finding metadata", () => {
	const baseline = makeBaseline(rawReport([finding()]), "c".repeat(40));
	for (const sourceCommit of [undefined, null, "", "not-a-commit", "a".repeat(39), "z".repeat(40), 42]) {
		const malformed = structuredClone(baseline);
		malformed.sourceCommit = sourceCommit;
		assert.throws(() => validateBaseline(malformed), Error, `sourceCommit=${sourceCommit}`);
	}
	for (const field of ["file", "rule", "message", "lineText"]) {
		for (const value of [undefined, null, "", " \t ", 42]) {
			const malformed = structuredClone(baseline);
			malformed.entries[0][field] = value;
			assert.throws(() => validateBaseline(malformed), Error, `${field}=${value}`);
		}
	}
});

test("baseline fingerprints must describe their recorded source identity", () => {
	const baseline = makeBaseline(rawReport([finding()]), "c".repeat(40));
	for (const [field, value] of [
		["file", "backend/internal/different.js"],
		["rule", "different-rule"],
		["message", "A different finding"],
		["lineText", 'throw new Error("Different source");'],
		["fingerprint", "0".repeat(64)],
	]) {
		const malformed = structuredClone(baseline);
		malformed.entries[0][field] = value;
		assert.throws(() => validateBaseline(malformed), Error, field);
	}
});

test("full scans keep existing shifted findings visible without failing the gate", () => {
	const baseline = makeBaseline(rawReport([finding()]), "d".repeat(40));
	const report = rawReport([finding({ line: 100 }), finding({ severity: "warning", line: 101 })]);
	const evaluation = evaluateReport(report, baseline);
	assert.equal(evaluation.passed, true);
	assert.equal(evaluation.issues.length, 2);
	assert.equal(evaluation.legacy.length, 1);
	assert.equal(evaluation.newErrors.length, 0);
	assert.equal(evaluation.legacy[0].line, 100);
});

test("adding an identical violation beyond its baseline count fails the gate", () => {
	const baseline = makeBaseline(rawReport([finding()]), "e".repeat(40));
	const evaluation = evaluateReport(rawReport([finding({ line: 10 }), finding({ line: 20 })]), baseline);
	assert.equal(evaluation.passed, false);
	assert.equal(evaluation.legacy.length, 1);
	assert.equal(evaluation.newErrors.length, 1);
	assert.equal(evaluation.newErrors[0].line, 20);
});

test("changed-line scans never exempt errors already present in the workspace baseline", () => {
	const baseline = makeBaseline(rawReport([finding()]), "f".repeat(40));
	const evaluation = evaluateReport(rawReport([finding({ line: 14 })]), baseline, false);
	assert.equal(evaluation.passed, false);
	assert.equal(evaluation.legacy.length, 0);
	assert.equal(evaluation.newErrors.length, 1);
});

test("warnings remain advisory while changed source and missing source text are new errors", () => {
	const baseline = makeBaseline(rawReport([finding()]), "0".repeat(40));
	assert.equal(evaluateReport(rawReport([finding({ severity: "warning" })]), baseline).passed, true);
	for (const issue of [finding({ line_text: 'throw new Error("New failure");' }), finding({ line_text: null })]) {
		const evaluation = evaluateReport(rawReport([issue]), baseline);
		assert.equal(evaluation.passed, false);
		assert.equal(evaluation.newErrors.length, 1);
		assert.equal(evaluation.legacy.length, 0);
	}
});

test("summary keeps baseline, new and advisory findings explicit and lists scanner failures", () => {
	const baseline = makeBaseline(rawReport([finding()]), "1".repeat(40));
	const report = rawReport([
		finding(),
		finding({ line: 8, line_text: 'throw new Error("New failure");' }),
		finding({ line: 9, severity: "warning", rule: "no-explicit-any" }),
	]);
	report.summary.scan_errors = ["Cannot parse a checked source file"];
	const summary = summaryMarkdown(report, evaluateReport(report, baseline), "workspace");
	assert.match(summary, /Result: \*\*FAIL\*\*/);
	assert.match(summary, /New errors: 1/);
	assert.match(summary, /Existing baseline errors: 1/);
	assert.match(summary, /Advisory findings: 1/);
	assert.match(summary, /Scanner failures: 1/);
	assert.match(summary, /example\.js:4/);
	assert.match(summary, /example\.js:8/);
	assert.match(summary, /no-explicit-any/);
	assert.match(summary, /Cannot parse a checked source file/);
	assert.match(summary, /artifact contains every finding/);
});

test("summary renders untrusted HTML and Markdown as text without injected rows or links", () => {
	const payload =
		'<img src="remote" onerror="bad()"> `code` [click](https://invalid.example) ![image](remote)\r\n## forged';
	const report = rawReport([finding({ message: payload, rule: payload })]);
	report.summary.scan_errors = [payload];
	const summary = summaryMarkdown(report, evaluateReport(report, emptyBaseline()), payload);
	assert.doesNotMatch(summary, /<img/);
	assert.doesNotMatch(summary, /`code`/);
	assert.doesNotMatch(summary, /\[click\]\(https:\/\/invalid\.example\)/);
	assert.doesNotMatch(summary, /!\[image\]\(remote\)/);
	assert.doesNotMatch(summary, /\n## forged/);
	assert.doesNotMatch(summary, /\r/);
	assert.match(summary, /&lt;img/);
});

test("summary limits displayed findings while retaining the complete count", () => {
	const report = rawReport(
		Array.from({ length: 40 }, (_, index) => finding({ severity: "warning", line: index + 1 })),
	);
	const summary = summaryMarkdown(report, evaluateReport(report, emptyBaseline()), "workspace");
	assert.match(summary, /Advisory findings: 40/);
	assert.equal(summary.split("\n").filter((line) => line.startsWith("- ")).length, 30);
});
