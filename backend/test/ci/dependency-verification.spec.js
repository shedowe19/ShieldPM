import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const source = fs.readFileSync(fileURLToPath(new URL("../../../scripts/ci/verify-dependencies.sh", import.meta.url)));
let directory;
let log;
const commands = [
	["backend", "node", "node_modules/typescript/bin/tsc --noEmit"],
	["backend", "npx", "--yes --package yarn@1.22.22 yarn test --run"],
	["frontend", "node", "check-locales.cjs"],
	["frontend", "npx", "--yes --package yarn@1.22.22 yarn test --run"],
	["frontend", "npx", "--yes --package yarn@1.22.22 yarn build"],
	[
		".",
		"node",
		"frontend/scripts/ci/check-bundle-budget.cjs --dist frontend/dist --budget frontend/performance-budget.json",
	],
];

beforeEach(() => {
	directory = fs.mkdtempSync(join(os.tmpdir(), "shieldpm-dependency-verification-"));
	for (const folder of ["scripts/ci", "backend", "frontend", "bin"]) {
		fs.mkdirSync(join(directory, folder), { recursive: true });
	}
	fs.writeFileSync(join(directory, "scripts/ci/verify-dependencies.sh"), source);
	log = join(directory, "commands.log");
	const executable = `#!/usr/bin/env bash
printf '%s\\t%s\\t%s\\n' "$PWD" "$(basename "$0")" "$*" >> "$COMMAND_LOG"
if [[ "$PWD" == "$FAIL_DIRECTORY" && "$*" == "$FAIL_ARGUMENTS" ]]; then exit 17; fi
`;
	for (const name of ["node", "npx"]) fs.writeFileSync(join(directory, "bin", name), executable, { mode: 0o700 });
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

const run = (failure = undefined) => {
	const env = {
		...process.env,
		PATH: `${join(directory, "bin")}:${process.env.PATH}`,
		COMMAND_LOG: log,
		FAIL_DIRECTORY: failure ? join(directory, failure[0]) : "",
		FAIL_ARGUMENTS: failure?.[2] || "",
	};
	return () =>
		execFileSync("bash", [join(directory, "scripts/ci/verify-dependencies.sh")], { env, cwd: os.tmpdir() });
};
const calls = () =>
	fs
		.readFileSync(log, "utf8")
		.trim()
		.split("\n")
		.map((line) => {
			const [cwd, executable, args] = line.split("\t");
			return [cwd === directory ? "." : cwd.slice(directory.length + 1), executable, args];
		});

describe("dependency verification executable gate", () => {
	it("runs types, all tests, locales, build and budget from the correct package directories", () => {
		expect(run()).not.toThrow();
		expect(calls()).toEqual(commands);
	});
	it.each(commands.map((command, index) => [index, command]))(
		"fails at check %i and never publishes a later success",
		(index, command) => {
			expect(run(command)).toThrow();
			expect(calls()).toEqual(commands.slice(0, index + 1));
		},
	);
});
