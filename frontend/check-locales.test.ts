import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

let fakeBin = "";

afterEach(() => {
	if (fakeBin) {
		rmSync(fakeBin, { force: true, recursive: true });
		fakeBin = "";
	}
});

describe("check-locales", () => {
	it("fails closed with an extraction error when FormatJS cannot extract locale IDs", () => {
		fakeBin = mkdtempSync(join(tmpdir(), "shieldpm-locale-check-"));
		const fakeYarn = join(fakeBin, "yarn");
		writeFileSync(fakeYarn, "#!/bin/sh\nexit 7\n", { mode: 0o755 });
		chmodSync(fakeYarn, 0o755);

		const result = spawnSync(process.execPath, ["check-locales.cjs"], {
			cwd: process.cwd(),
			encoding: "utf8",
			env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH || ""}` },
		});

		expect(result.status).toBe(1);
		expect(`${result.stdout}\n${result.stderr}`).toContain("Locale extraction failed");
	});

	it("passes the source glob to FormatJS without shell quotes", () => {
		fakeBin = mkdtempSync(join(tmpdir(), "shieldpm-locale-check-"));
		const fakeYarn = join(fakeBin, "yarn");
		const argsFile = join(fakeBin, "formatjs-args.json");
		writeFileSync(
			fakeYarn,
			`#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.writeFileSync(process.env.FORMATJS_ARGS_FILE, JSON.stringify(args));
fs.writeFileSync(args[args.indexOf("--out-file") + 1], "{}");
`,
			{ mode: 0o755 },
		);
		chmodSync(fakeYarn, 0o755);

		const result = spawnSync(process.execPath, ["check-locales.cjs"], {
			cwd: process.cwd(),
			encoding: "utf8",
			env: {
				...process.env,
				FORMATJS_ARGS_FILE: argsFile,
				PATH: `${fakeBin}:${process.env.PATH || ""}`,
			},
		});

		expect(result.status).toBe(0);
		expect(JSON.parse(readFileSync(argsFile, "utf8"))).toContain("src/**/*.tsx");
	});
});
