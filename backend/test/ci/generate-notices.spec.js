import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const noticeGenerator = join(repoRoot, "scripts/generate-notices.js");
const extraNotices = join(repoRoot, "scripts/third-party-notices-extra.txt");
const temporaryDirectories = [];

const createFixture = (licenseCheckFails, { scannerScanFails = false, missingScannerLicense = false } = {}) => {
	const root = fs.mkdtempSync(join(tmpdir(), "shieldpm-notices-"));
	temporaryDirectories.push(root);
	const scriptsDirectory = join(root, "scripts");
	const binDirectory = join(root, "bin");
	const noticesPath = join(root, "THIRD-PARTY-NOTICES.md");
	const scanLogPath = join(root, "license-scans.jsonl");

	fs.mkdirSync(scriptsDirectory, { recursive: true });
	fs.mkdirSync(binDirectory, { recursive: true });
	fs.mkdirSync(join(root, "backend"));
	fs.mkdirSync(join(root, "frontend"));
	fs.mkdirSync(join(root, ".tscanner"));
	fs.writeFileSync(
		join(root, ".tscanner/package.json"),
		JSON.stringify({
			private: true,
			devDependencies: { "@babel/parser": "8.0.7", "@babel/traverse": "8.0.7", tscanner: "0.1.3" },
		}),
	);
	fs.copyFileSync(noticeGenerator, join(scriptsDirectory, "generate-notices.js"));
	fs.copyFileSync(extraNotices, join(scriptsDirectory, "third-party-notices-extra.txt"));
	fs.writeFileSync(noticesPath, "# Existing notices\n\nDo not overwrite this on a failed scan.\n");
	fs.writeFileSync(
		join(binDirectory, "license-checker"),
		[
			`#!${process.execPath}`,
			'const fs = require("node:fs");',
			'const path = require("node:path");',
			`fs.appendFileSync(${JSON.stringify(scanLogPath)}, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }) + "\\n");`,
			'const scanner = path.basename(process.cwd()) === ".tscanner";',
			`if (${licenseCheckFails} || (scanner && ${scannerScanFails})) {`,
			'	process.stderr.write("license-checker failed\\n");',
			"	process.exit(17);",
			"}",
			'const licenses = scanner ? { "@babel/parser@8.0.7": { licenses: "MIT" }, "@babel/traverse@8.0.7": { licenses: "MIT" }, "tscanner@0.1.3": { licenses: "MIT" }, "transitive-fixture@9.0.0": { licenses: "BSD-2-Clause" }, "shieldpm-code-scanning@1.0.0": { licenses: "UNLICENSED", private: true } } : { "fixture-package@1.2.3": { licenses: "MIT" } };',
			`if (scanner && ${missingScannerLicense}) delete licenses["tscanner@0.1.3"];`,
			"process.stdout.write(JSON.stringify(licenses));",
		].join("\n"),
	);
	fs.chmodSync(join(binDirectory, "license-checker"), 0o755);

	return { binDirectory, noticesPath, root, scanLogPath };
};

const executeGenerator = (fixture) =>
	spawnSync(process.execPath, [join(fixture.root, "scripts/generate-notices.js")], {
		cwd: fixture.root,
		encoding: "utf8",
		env: { ...process.env, PATH: fixture.binDirectory },
	});

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { force: true, recursive: true });
	}
});

describe("third-party notice generator", () => {
	it("does not replace existing notices when a license scan fails", () => {
		const fixture = createFixture(true);
		const result = executeGenerator(fixture);

		expect(result.status).not.toBe(0);
		expect(fs.readFileSync(fixture.noticesPath, "utf8")).toBe(
			"# Existing notices\n\nDo not overwrite this on a failed scan.\n",
		);
	});

	it("writes notices only after every license scan succeeds", () => {
		const fixture = createFixture(false);
		const result = executeGenerator(fixture);

		expect(result.status).toBe(0);
		expect(fs.readFileSync(fixture.noticesPath, "utf8")).toContain(
			"[fixture-package@1.2.3](https://www.npmjs.com/package/fixture-package/v/1.2.3) - MIT",
		);
	});
	it("scans code-scanning tools as development dependencies after the four application scans", () => {
		const fixture = createFixture(false);
		expect(executeGenerator(fixture).status).toBe(0);
		const scans = fs.readFileSync(fixture.scanLogPath, "utf8").trim().split("\n").map(JSON.parse);
		expect(scans.map(({ cwd }) => cwd)).toEqual([
			join(fixture.root, "backend"),
			join(fixture.root, "backend"),
			join(fixture.root, "frontend"),
			join(fixture.root, "frontend"),
			join(fixture.root, ".tscanner"),
		]);
		expect(scans.map(({ args }) => args)).toEqual([
			["--start", ".", "--json", "--direct", "--production"],
			["--start", ".", "--json", "--direct", "--development"],
			["--start", ".", "--json", "--direct", "--production"],
			["--start", ".", "--json", "--direct", "--development"],
			["--start", ".", "--json", "--direct", "--development"],
		]);
	});
	it("keeps direct scanner dependencies in a separate development-only section", () => {
		const fixture = createFixture(false);
		expect(executeGenerator(fixture).status).toBe(0);
		const generated = fs.readFileSync(fixture.noticesPath, "utf8");
		const [applicationNotices, scannerNotices] = generated.split(
			"## Code-Scanning Development Dependencies (from .tscanner/package.json)",
		);
		expect(applicationNotices).not.toContain("tscanner@0.1.3");
		expect(applicationNotices).not.toContain("@babel/parser@8.0.7");
		expect(scannerNotices).toContain("They are not included in ShieldPM's production runtime.");
		expect(scannerNotices).toContain(
			"[@babel/parser@8.0.7](https://www.npmjs.com/package/@babel/parser/v/8.0.7) - MIT",
		);
		expect(scannerNotices).toContain(
			"[@babel/traverse@8.0.7](https://www.npmjs.com/package/@babel/traverse/v/8.0.7) - MIT",
		);
		expect(scannerNotices).toContain("[tscanner@0.1.3](https://www.npmjs.com/package/tscanner/v/0.1.3) - MIT");
		expect(scannerNotices).not.toContain("transitive-fixture");
		expect(scannerNotices).not.toContain("shieldpm-code-scanning@");
	});
	it("preserves existing notices when the fifth scan fails", () => {
		const fixture = createFixture(false, { scannerScanFails: true });
		expect(executeGenerator(fixture).status).not.toBe(0);
		expect(fs.readFileSync(fixture.scanLogPath, "utf8").trim().split("\n")).toHaveLength(5);
		expect(fs.readFileSync(fixture.noticesPath, "utf8")).toBe(
			"# Existing notices\n\nDo not overwrite this on a failed scan.\n",
		);
	});
	it("preserves existing notices if a declared scanner dependency is missing", () => {
		const fixture = createFixture(false, { missingScannerLicense: true });
		const result = executeGenerator(fixture);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("Missing installed code-scanning dependencies: tscanner");
		expect(fs.readFileSync(fixture.noticesPath, "utf8")).toBe(
			"# Existing notices\n\nDo not overwrite this on a failed scan.\n",
		);
	});
	it("retains the feed and fixture attributions without duplication on repeated regeneration", () => {
		const fixture = createFixture(false);
		const source = fs.readFileSync(extraNotices, "utf8").trim();
		for (let attempt = 0; attempt < 2; attempt++) {
			expect(executeGenerator(fixture).status).toBe(0);
			const generated = fs.readFileSync(fixture.noticesPath, "utf8");
			expect(generated).toContain(source);
			expect(generated.match(/## Optional IP Firewall Feed Presets/g)).toHaveLength(1);
			expect(generated.match(/## MaxMind GeoIP Test Fixtures/g)).toHaveLength(1);
			expect(generated).toContain("./scripts/ci/fixtures/MAXMIND-LICENSE.txt");
		}
	});
	it("preserves existing notices when the static attribution source is unavailable", () => {
		const fixture = createFixture(false);
		fs.unlinkSync(join(fixture.root, "scripts/third-party-notices-extra.txt"));
		expect(executeGenerator(fixture).status).not.toBe(0);
		expect(fs.readFileSync(fixture.noticesPath, "utf8")).toBe(
			"# Existing notices\n\nDo not overwrite this on a failed scan.\n",
		);
	});
});
