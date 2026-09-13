import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { formatMaintenanceDateTime, serializeMaintenanceDateTime } from "./maintenanceDateTime";

describe("maintenance timestamps", () => {
	it("clears empty schedule inputs and hides invalid legacy timestamps", () => {
		expect(serializeMaintenanceDateTime("")).toBeNull();
		expect(serializeMaintenanceDateTime(undefined)).toBeUndefined();
		expect(formatMaintenanceDateTime("invalid-date")).toBe("");
	});

	it.each([
		["Europe/Berlin", "2026-07-12T11:30:00", "2026-01-12T10:30:00"],
		["America/New_York", "2026-07-12T05:30:00", "2026-01-12T04:30:00"],
	])(
		"round-trips absolute instants through the browser timezone %s, including daylight saving",
		(timezone, summer, winter) => {
			// A fresh Node process applies TZ reliably even when Vitest uses worker threads.
			const moduleUrl = pathToFileURL(resolve("src/lib/maintenanceDateTime.ts")).href;
			const output = execFileSync(
				process.execPath,
				[
					"--input-type=module",
					"-e",
					`
			const {formatMaintenanceDateTime, serializeMaintenanceDateTime} = await import(${JSON.stringify(moduleUrl)});
			const results = ["2026-07-12T09:30:00.000Z", "2026-01-12T09:30:00.000Z"].map(value => {
				const local = formatMaintenanceDateTime(value);
				return [local, serializeMaintenanceDateTime(local)];
			});
			process.stdout.write(JSON.stringify(results));
		`,
				],
				{ env: { ...process.env, TZ: timezone }, encoding: "utf8" },
			);

			expect(JSON.parse(output)).toEqual([
				[summer, "2026-07-12T09:30:00.000Z"],
				[winter, "2026-01-12T09:30:00.000Z"],
			]);
		},
	);
});
