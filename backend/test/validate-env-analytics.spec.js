import { execFileSync, spawnSync } from "node:child_process";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "./helpers/source-path.js";

const validator = backendSourcePath("validate-env.cjs");
const baseEnvironment = { PATH: process.env.PATH, TZ: "UTC" };

describe("analytics environment validation", () => {
	it("exports bounded durable-spool defaults", () => {
		const output = execFileSync(process.execPath, [validator], {
			encoding: "utf8",
			env: baseEnvironment,
		});
		expect(output).toContain("export ANALYTICS_SPOOL_PATH='/data/shieldpm/analytics-spool.ndjson'");
		expect(output).toContain("export ANALYTICS_SPOOL_MAX_BYTES='67108864'");
		expect(output).toContain("export ANALYTICS_SPOOL_RECORD_MAX_BYTES='262144'");
		expect(output).toContain("export ANALYTICS_SPOOL_BATCH_RECORDS='250'");
	});

	it.each([
		[{ ANALYTICS_SPOOL_PATH: "relative.ndjson" }, /absolute, normalized path/],
		[{ ANALYTICS_SPOOL_PATH: "/data/shieldpm/../escape.ndjson" }, /absolute, normalized path/],
		[
			{ ANALYTICS_SPOOL_MAX_BYTES: "1024", ANALYTICS_SPOOL_RECORD_MAX_BYTES: "2048" },
			/RECORD_MAX_BYTES must not exceed/,
		],
		[{ ANALYTICS_SPOOL_BATCH_RECORDS: "0" }, /greater than zero/],
	])("rejects unsafe analytics spool configuration %#", (overrides, expectedError) => {
		const result = spawnSync(process.execPath, [validator], {
			encoding: "utf8",
			env: { ...baseEnvironment, ...overrides },
		});
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(expectedError);
	});
});
