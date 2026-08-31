import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

let fakeBin = "";

afterEach(() => {
	if (fakeBin) {
		rmSync(fakeBin, { force: true, recursive: true });
		fakeBin = "";
	}
});

const withFakeFormatJs = <T>(source: string, callback: () => T): T => {
	const formatJsPath = resolve(process.cwd(), "node_modules/.bin/formatjs");
	const backupPath = `${formatJsPath}.check-locales-test-backup`;
	renameSync(formatJsPath, backupPath);
	writeFileSync(formatJsPath, source, { mode: 0o755 });
	chmodSync(formatJsPath, 0o755);

	try {
		return callback();
	} finally {
		rmSync(formatJsPath, { force: true });
		renameSync(backupPath, formatJsPath);
	}
};

describe("check-locales", () => {
	it("fails closed when the project FormatJS executable cannot extract locale IDs", () => {
		fakeBin = mkdtempSync(join(tmpdir(), "shieldpm-locale-check-"));
		const fakeYarn = join(fakeBin, "yarn");
		writeFileSync(
			fakeYarn,
			`#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.writeFileSync(args[args.indexOf("--out-file") + 1], "{}");
`,
			{ mode: 0o755 },
		);
		chmodSync(fakeYarn, 0o755);

		const result = withFakeFormatJs("#!/bin/sh\nexit 7\n", () =>
			spawnSync(process.execPath, ["check-locales.cjs"], {
				cwd: process.cwd(),
				encoding: "utf8",
				env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH || ""}` },
			}),
		);

		expect(result.status).toBe(1);
		expect(`${result.stdout}\n${result.stderr}`).toContain("Locale extraction failed: exit code 7");
	});

	it("passes an absolute source glob so extraction is independent of the caller's working directory", () => {
		fakeBin = mkdtempSync(join(tmpdir(), "shieldpm-locale-check-"));
		const argsFile = join(fakeBin, "formatjs-args.json");

		const result = withFakeFormatJs(
			`#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.writeFileSync(process.env.FORMATJS_ARGS_FILE, JSON.stringify(args));
fs.writeFileSync(args[args.indexOf("--out-file") + 1], "{}");
`,
			() =>
				spawnSync(process.execPath, ["check-locales.cjs"], {
					cwd: process.cwd(),
					encoding: "utf8",
					env: { ...process.env, FORMATJS_ARGS_FILE: argsFile },
				}),
		);

		expect(result.status).toBe(0);
		const expectedGlob = `${resolve(process.cwd(), "src").split("\\").join("/")}/**/*.tsx`;
		expect(JSON.parse(readFileSync(argsFile, "utf8"))).toContain(expectedGlob);
	});
});
