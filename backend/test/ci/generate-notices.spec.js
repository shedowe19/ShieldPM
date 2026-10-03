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

const createFixture = (licenseCheckFails) => {
	const root = fs.mkdtempSync(join(tmpdir(), "shieldpm-notices-"));
	temporaryDirectories.push(root);
	const scriptsDirectory = join(root, "scripts");
	const binDirectory = join(root, "bin");
	const noticesPath = join(root, "THIRD-PARTY-NOTICES.md");

	fs.mkdirSync(scriptsDirectory, { recursive: true });
	fs.mkdirSync(binDirectory, { recursive: true });
	fs.mkdirSync(join(root, "backend"));
	fs.mkdirSync(join(root, "frontend"));
	fs.copyFileSync(noticeGenerator, join(scriptsDirectory, "generate-notices.js"));
	fs.copyFileSync(extraNotices, join(scriptsDirectory, "third-party-notices-extra.txt"));
	fs.writeFileSync(noticesPath, "# Existing notices\n\nDo not overwrite this on a failed scan.\n");
	fs.writeFileSync(
		join(binDirectory, "license-checker"),
		[
			`#!${process.execPath}`,
			`if (${licenseCheckFails}) {`,
			'	process.stderr.write("license-checker failed\\n");',
			"	process.exit(17);",
			"}",
			'process.stdout.write(JSON.stringify({ "fixture-package@1.2.3": { licenses: "MIT" } }));',
		].join("\n"),
	);
	fs.chmodSync(join(binDirectory, "license-checker"), 0o755);

	return { binDirectory, noticesPath, root };
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
	it("retains the feed and fixture attributions without duplication on repeated regeneration", () => {
		const fixture = createFixture(false);
		const source = fs.readFileSync(extraNotices, "utf8").trim();
		for (let attempt = 0; attempt < 2; attempt++) {
			expect(executeGenerator(fixture).status).toBe(0);
			const generated = fs.readFileSync(fixture.noticesPath, "utf8");
			expect(generated).toContain(source);
			expect(generated.match(/## Optional IP Firewall Feed Presets/g)).toHaveLength(1);
			expect(generated.match(/## MaxMind GeoIP2 Test Fixture/g)).toHaveLength(1);
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
