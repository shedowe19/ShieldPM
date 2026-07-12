import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const readBackendSource = (...segments) => fs.readFileSync(backendSourcePath(...segments), "utf8");

const startupFiles = ["index.js", "index-dev.js"];

describe("analytics startup order", () => {
	it("does not start analytics while constructing the Express application", () => {
		const appSource = readBackendSource("app.js");

		expect(appSource).not.toMatch(/analyticsService\.init\(\)/);
	});

	for (const startupFile of startupFiles) {
		it(`starts analytics after database migrations in ${startupFile}`, () => {
			const startupSource = readBackendSource(startupFile);
			const migrationIndex = startupSource.indexOf("await migrateUp();");
			const analyticsInitIndex = startupSource.indexOf("await analyticsService.init();");

			expect(migrationIndex).toBeGreaterThanOrEqual(0);
			expect(analyticsInitIndex).toBeGreaterThan(migrationIndex);
		});
	}
});
