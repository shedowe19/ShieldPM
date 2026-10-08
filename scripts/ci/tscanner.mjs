import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { assertTrustedAiRunner } from "./tscanner-runner.mjs";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const configDirectory = path.join(workspaceRoot, ".tscanner");
const baselinePath = path.join(configDirectory, "baseline.json");
const cliPath = path.join(configDirectory, "node_modules/tscanner/dist/main.js");
const severities = new Set(["error", "warning", "info", "hint"]);

export function parseArguments(args) {
	const options = { reportDirectory: ".tscanner/reports" };
	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		if (["--branch", "--report-dir"].includes(argument)) {
			const value = args[++index];
			if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
			options[argument === "--branch" ? "branch" : "reportDirectory"] = value;
		} else if (
			["--staged", "--uncommitted", "--only-ai", "--include-ai", "--validate", "--update-baseline"].includes(
				argument,
			)
		) {
			options[argument.slice(2)] = true;
		} else {
			throw new Error(`Unknown scanner option: ${argument}`);
		}
	}
	if ([options.branch, options.staged, options.uncommitted].filter(Boolean).length > 1) {
		throw new Error("Choose one of --branch, --staged or --uncommitted.");
	}
	if (options["only-ai"] && options["include-ai"]) throw new Error("Choose one AI scan mode.");
	if ((options["only-ai"] || options["include-ai"]) && (options.branch || options.staged || options.uncommitted)) {
		throw new Error("AI scans review the full workspace and cannot be combined with changed-line modes.");
	}
	if (
		options["update-baseline"] &&
		(options.branch || options.staged || options.uncommitted || options["only-ai"] || options["include-ai"])
	) {
		throw new Error("Baseline updates require a full deterministic scan.");
	}
	if (options.validate && Object.keys(options).length > 2)
		throw new Error("Validation cannot be combined with a scan mode.");
	return options;
}

export function flattenReport(report) {
	if (!report || !Array.isArray(report.files) || !report.summary || typeof report.summary !== "object") {
		throw new Error("Scanner output must contain files and a summary.");
	}
	const issues = [];
	for (const group of report.files) {
		if (!group || typeof group.file !== "string" || !Array.isArray(group.issues))
			throw new Error("Malformed scanner file group.");
		const normalizedFile = group.file.replaceAll("\\", "/");
		if (
			!normalizedFile ||
			path.posix.isAbsolute(normalizedFile) ||
			path.win32.isAbsolute(group.file) ||
			/^[A-Za-z]:/.test(normalizedFile) ||
			/[\0\r\n]/.test(normalizedFile) ||
			normalizedFile.split("/").includes("..")
		)
			throw new Error("Scanner reported a path outside the repository.");
		for (const issue of group.issues) {
			if (
				!issue ||
				typeof issue.rule !== "string" ||
				typeof issue.message !== "string" ||
				!severities.has(issue.severity) ||
				!Number.isInteger(issue.line) ||
				issue.line < 1
			) {
				throw new Error("Malformed scanner issue.");
			}
			issues.push({ ...issue, file: normalizedFile });
		}
	}
	for (const key of [
		"total_files",
		"cached_files",
		"scanned_files",
		"files_with_issues",
		"total_issues",
		"errors",
		"warnings",
		"infos",
		"hints",
		"triggered_rules",
		"total_enabled_rules",
	]) {
		if (!Number.isSafeInteger(report.summary[key]) || report.summary[key] < 0) {
			throw new Error(`Invalid ${key} in scanner summary.`);
		}
	}
	if (
		report.summary.total_issues !== issues.length ||
		report.summary.files_with_issues !== new Set(issues.map((issue) => issue.file)).size ||
		report.summary.total_files < report.summary.files_with_issues ||
		report.summary.cached_files + report.summary.scanned_files !== report.summary.total_files ||
		[...severities].some(
			(severity) =>
				report.summary[{ error: "errors", warning: "warnings", info: "infos", hint: "hints" }[severity]] !==
				issues.filter((issue) => issue.severity === severity).length,
		)
	) {
		throw new Error("Scanner summary does not match its findings.");
	}
	for (const key of ["scan_warnings", "scan_errors"]) {
		if (
			report.summary[key] !== undefined &&
			(!Array.isArray(report.summary[key]) || report.summary[key].some((value) => typeof value !== "string"))
		) {
			throw new Error(`Malformed ${key} in scanner summary.`);
		}
	}
	return issues;
}

export function fingerprint(issue) {
	if (typeof issue.line_text !== "string" || !issue.line_text.trim()) return null;
	return createHash("sha256")
		.update(JSON.stringify([issue.file, issue.rule, issue.message, issue.line_text.trim()]))
		.digest("hex");
}

export function validateBaseline(baseline) {
	if (
		baseline?.version !== 1 ||
		!Array.isArray(baseline.entries) ||
		!/^[a-f0-9]{40}$/.test(baseline.sourceCommit) ||
		typeof baseline.reason !== "string" ||
		!baseline.reason.trim()
	)
		throw new Error("Invalid scanner baseline.");
	const seen = new Set();
	for (const entry of baseline.entries) {
		if (
			!entry ||
			typeof entry.file !== "string" ||
			typeof entry.rule !== "string" ||
			typeof entry.message !== "string" ||
			typeof entry.lineText !== "string" ||
			!entry.lineText.trim() ||
			fingerprint({ ...entry, line_text: entry.lineText }) !== entry.fingerprint ||
			!/^[a-f0-9]{64}$/.test(entry.fingerprint) ||
			!Number.isInteger(entry.count) ||
			entry.count < 1 ||
			seen.has(entry.fingerprint)
		) {
			throw new Error("Invalid or duplicate baseline entry.");
		}
		seen.add(entry.fingerprint);
	}
	return baseline;
}

export function evaluateReport(report, baseline, allowBaseline = true) {
	const issues = flattenReport(report);
	validateBaseline(baseline);
	const remaining = new Map(allowBaseline ? baseline.entries.map((entry) => [entry.fingerprint, entry.count]) : []);
	const legacy = [];
	const newErrors = [];
	for (const issue of issues.filter((item) => item.severity === "error")) {
		const key = fingerprint(issue);
		const allowance = remaining.get(key) ?? 0;
		if (key && allowance > 0) {
			remaining.set(key, allowance - 1);
			legacy.push(issue);
		} else {
			newErrors.push(issue);
		}
	}
	const infrastructureErrors = [...(report.summary.scan_errors ?? []), ...(report.summary.scan_warnings ?? [])];
	return {
		issues,
		legacy,
		newErrors,
		infrastructureErrors,
		passed: newErrors.length === 0 && infrastructureErrors.length === 0,
	};
}

export function makeBaseline(report, sourceCommit) {
	const entries = new Map();
	for (const issue of flattenReport(report).filter((item) => item.severity === "error")) {
		const key = fingerprint(issue);
		if (!key) throw new Error(`Cannot baseline a finding without source text: ${issue.file}:${issue.line}`);
		const entry = entries.get(key) ?? {
			fingerprint: key,
			count: 0,
			file: issue.file,
			rule: issue.rule,
			message: issue.message,
			lineText: issue.line_text.trim(),
		};
		entry.count++;
		entries.set(key, entry);
	}
	return {
		version: 1,
		sourceCommit,
		reason: "Visible existing findings at scanner introduction; review changes to this file explicitly. Changed-line scans never apply baseline allowances.",
		entries: [...entries.values()].sort(
			(left, right) => left.file.localeCompare(right.file) || left.fingerprint.localeCompare(right.fingerprint),
		),
	};
}

const escapeMarkdown = (value) =>
	String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll("`", "&#96;")
		.replaceAll("\\", "&#92;")
		.replace(/[[\]()!*_#]/g, (character) => `&#${character.charCodeAt(0)};`)
		.replace(/[\r\n]/g, " ");
const escapeCommand = (value) => String(value).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
const escapeProperty = (value) => escapeCommand(value).replaceAll(":", "%3A").replaceAll(",", "%2C");

export function summaryMarkdown(report, evaluation, mode) {
	const lines = [
		"## TScanner",
		"",
		`Mode: ${escapeMarkdown(mode)}. Result: **${evaluation.passed ? "PASS" : "FAIL"}**.`,
		"",
		`Files: ${report.summary.total_files}. New errors: ${evaluation.newErrors.length}. Existing baseline errors: ${evaluation.legacy.length}. Advisory findings: ${evaluation.issues.length - evaluation.newErrors.length - evaluation.legacy.length}. Scanner failures: ${evaluation.infrastructureErrors.length}.`,
		"",
		"The artifact contains every finding, including the existing baseline. AI review is opt-in locally or on the trusted subscription runner.",
	];
	for (const issue of [
		...evaluation.newErrors,
		...evaluation.legacy,
		...evaluation.issues.filter((item) => item.severity !== "error"),
	].slice(0, 30)) {
		lines.push(
			`- \`${escapeMarkdown(issue.file)}:${issue.line}\` — ${escapeMarkdown(issue.rule)}: ${escapeMarkdown(issue.message)}`,
		);
	}
	for (const error of evaluation.infrastructureErrors) lines.push(`- Scanner failure: ${escapeMarkdown(error)}`);
	return `${lines.join("\n")}\n`;
}

function runGit(args, root = workspaceRoot) {
	const result = spawnSync("git", args, {
		cwd: root,
		encoding: "utf8",
		timeout: 30_000,
	});
	if (result.error || result.status !== 0)
		throw new Error(`Git operation failed: ${result.error?.message ?? result.stderr.trim()}`);
	return args.includes("-z") ? result.stdout : result.stdout.trim();
}

export function validateDiffScope(
	options,
	root = workspaceRoot,
	configuration = JSON.parse(fs.readFileSync(path.join(root, ".tscanner/config.jsonc"), "utf8")),
) {
	const scannable = (file) =>
		configuration.files.include.some((pattern) => path.matchesGlob(file, pattern)) &&
		!configuration.files.exclude.some((pattern) => path.matchesGlob(file, pattern));
	const gitPaths = (args) =>
		runGit([...args, "-z"], root)
			.split("\0")
			.filter(Boolean);
	if (options.staged) {
		const staged = new Set(gitPaths(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]));
		const mismatches = gitPaths(["diff", "--name-only"]).filter((file) => staged.has(file) && scannable(file));
		if (mismatches.length) {
			throw new Error(
				`Staged scanning requires matching index and working-tree source. Stage the complete changes or run a full scan: ${mismatches.join(", ")}`,
			);
		}
	}
	if (options.uncommitted || options.branch) {
		const untracked = gitPaths(["ls-files", "--others", "--exclude-standard"]).filter(scannable);
		if (untracked.length) {
			throw new Error(
				`Changed-line scanning excludes untracked source. Stage these files or run a full scan: ${untracked.join(", ")}`,
			);
		}
	}
}

function runNative(args, timeout = 300_000, serialAi = false) {
	if (!fs.existsSync(cliPath))
		throw new Error(
			"Scanner dependencies are missing. Run yarn --cwd .tscanner install --frozen-lockfile --ignore-scripts --production=false.",
		);
	const result = spawnSync(process.execPath, [cliPath, ...args], {
		cwd: workspaceRoot,
		encoding: "utf8",
		timeout,
		maxBuffer: 32 * 1024 * 1024,
		env: serialAi ? { ...process.env, RAYON_NUM_THREADS: "1" } : process.env,
	});
	if (result.error || result.signal)
		throw new Error(`Scanner execution failed: ${result.error?.message ?? result.signal}`);
	return result;
}

export function main(args = process.argv.slice(2)) {
	const options = parseArguments(args);
	if (Number(process.versions.node.split(".")[0]) < 26)
		throw new Error("ShieldPM scanning requires Node.js 26 or newer.");
	const aiRequested = options["only-ai"] || options["include-ai"];
	const runnerAi = Boolean(aiRequested && (process.env.CI || process.env.GITHUB_ACTIONS));
	if (runnerAi) assertTrustedAiRunner();
	const reportDirectory = path.resolve(workspaceRoot, options.reportDirectory);
	if (runnerAi) {
		if (reportDirectory !== path.join(configDirectory, "reports-codex")) {
			throw new Error("Runner AI reports must use .tscanner/reports-codex.");
		}
		for (const directory of [configDirectory, reportDirectory]) {
			if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) {
				throw new Error("Runner AI report directories cannot be symbolic links.");
			}
		}
		// Remove stale output and child links before writing fresh artifacts; never follow links into authentication.
		fs.rmSync(reportDirectory, { recursive: true, force: true });
	}
	fs.mkdirSync(reportDirectory, { recursive: true });
	const nativeValidation = runNative(["validate"]);
	if (nativeValidation.status !== 0 || /(?:^|\n)\s*Warnings:/.test(stripVTControlCharacters(nativeValidation.stdout)))
		throw new Error(`Scanner configuration is invalid: ${nativeValidation.stdout}\n${nativeValidation.stderr}`);
	if (options.validate) {
		process.stdout.write(nativeValidation.stdout);
		return 0;
	}
	validateDiffScope(options);
	const rawReportPath = path.join(reportDirectory, "tscanner-results.json");
	fs.rmSync(rawReportPath, { force: true });
	const nativeArgs = [
		"check",
		"--group-by",
		"file",
		"--no-cache",
		"--continue-on-error",
		"--json-output",
		rawReportPath,
	];
	let mode = "workspace";
	if (options.branch) {
		const ref = runGit(["rev-parse", "--verify", "--end-of-options", `${options.branch}^{commit}`]);
		const base = runGit(["merge-base", "HEAD", ref]);
		nativeArgs.push("--branch", base);
		mode = `changed lines since ${base}`;
	} else if (options.staged || options.uncommitted) {
		const selected = options.staged ? "staged" : "uncommitted";
		nativeArgs.push(`--${selected}`);
		mode = selected;
	}
	if (options["only-ai"] || options["include-ai"]) {
		nativeArgs.push(options["only-ai"] ? "--only-ai" : "--include-ai");
		mode = runnerAi ? "trusted runner AI workspace review" : "local AI workspace review";
	}
	const native = runNative(nativeArgs, aiRequested ? 600_000 : 300_000, runnerAi);
	if (native.status !== 0 || !fs.existsSync(rawReportPath))
		throw new Error(`Scanner failed to produce a valid report: ${native.stderr || native.stdout}`);
	const report = JSON.parse(fs.readFileSync(rawReportPath, "utf8"));
	const issues = flattenReport(report);
	if (!options.branch && !options.staged && !options.uncommitted && !(report.summary.total_files > 0)) {
		throw new Error("Full-project scan unexpectedly matched no files.");
	}
	if (options["update-baseline"]) {
		if ((report.summary.scan_warnings?.length ?? 0) || (report.summary.scan_errors?.length ?? 0))
			throw new Error("Cannot update baseline after a scanner failure.");
		fs.writeFileSync(
			baselinePath,
			`${JSON.stringify(makeBaseline(report, runGit(["rev-parse", "HEAD"])), null, "\t")}\n`,
		);
	}
	const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
	const allowBaseline = !options.branch && !options.staged && !options.uncommitted;
	const evaluation = evaluateReport(report, baseline, allowBaseline);
	const summary = summaryMarkdown(report, evaluation, mode);
	fs.writeFileSync(path.join(reportDirectory, "summary.md"), summary);
	fs.writeFileSync(
		path.join(reportDirectory, "gate-results.json"),
		`${JSON.stringify(
			{
				mode,
				passed: evaluation.passed,
				totalFindings: issues.length,
				newErrors: evaluation.newErrors.length,
				baselineErrors: evaluation.legacy.length,
				infrastructureErrors: evaluation.infrastructureErrors,
			},
			null,
			"\t",
		)}\n`,
	);
	process.stdout.write(summary);
	if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
	if (process.env.GITHUB_ACTIONS === "true") {
		for (const issue of [...evaluation.newErrors, ...issues.filter((item) => item.severity === "warning")].slice(
			0,
			30,
		)) {
			process.stdout.write(
				`::${issue.severity} file=${escapeProperty(issue.file)},line=${issue.line}::${escapeCommand(`${issue.rule}: ${issue.message}`)}\n`,
			);
		}
		for (const error of evaluation.infrastructureErrors) process.stdout.write(`::error::${escapeCommand(error)}\n`);
	}
	return evaluation.passed ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	try {
		process.exitCode = main();
	} catch (error) {
		process.stderr.write(`TScanner integration failed: ${error.message}\n`);
		process.exitCode = 1;
	}
}
