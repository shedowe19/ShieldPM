import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const script = backendSourcePath("scripts", "rotate-encryption-key.js");
const dataPath = fs.mkdtempSync(join(tmpdir(), "shieldpm-rotation-"));
fs.mkdirSync(join(dataPath, "shieldpm"), { recursive: true });
fs.writeFileSync(
	join(dataPath, "shieldpm", "keys.json"),
	JSON.stringify({ encryptionKey: "02".repeat(32), pub: "unused", priv: "unused" }),
);

const run = (environment, args) =>
	spawnSync(process.execPath, [script, ...args], {
		encoding: "utf8",
		env: {
			...process.env,
			DATA_PATH: dataPath,
			SHIELDPM_ENCRYPTION_KEY: "02".repeat(32),
			...environment,
		},
	});

afterAll(() => fs.rmSync(dataPath, { recursive: true, force: true }));

describe("encryption key rotation command", () => {
	it("requires the previous key before touching the database", () => {
		const result = run({ SHIELDPM_ENCRYPTION_KEY_PREVIOUS: "" }, ["--yes"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("SHIELDPM_ENCRYPTION_KEY_PREVIOUS");
	});

	it("refuses to write without an explicit confirmation", () => {
		const result = run({ SHIELDPM_ENCRYPTION_KEY_PREVIOUS: "01".repeat(32) }, []);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Refusing to write without --yes");
	});
});
