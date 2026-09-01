import { describe, expect, it, vi } from "vitest";
import { verifyMigrationResume } from "../../scripts/ci/run-migrations-twice.js";

const migrationFixture = () => {
	const planned = ["001_initial.js", "002_feature.js", "003_repair.js", "004_hardening.js"];
	const completed = [];
	const migrate = {
		list: vi.fn(async () => [
			completed.map((name) => ({ name })),
			planned.filter((name) => !completed.includes(name)).map((file) => ({ file })),
		]),
		to: vi.fn(async ({ name }) => {
			const migrations = planned.slice(completed.length, planned.indexOf(name) + 1);
			completed.push(...migrations);
			return [1, migrations];
		}),
	};
	const migrateLatest = vi.fn(async () => {
		const migrations = planned.slice(completed.length);
		completed.push(...migrations);
		return [2, migrations];
	});

	return { database: { migrate }, migrate, migrateLatest, planned };
};

describe("migration resume verification", () => {
	it("applies a prefix, resumes only the suffix, validates the ledger, and finishes with a no-op", async () => {
		const fixture = migrationFixture();

		await expect(
			verifyMigrationResume({ database: fixture.database, migrateLatest: fixture.migrateLatest }),
		).resolves.toEqual({ checkpointCount: 2, resumedCount: 2, totalCount: 4 });
		expect(fixture.migrate.to).toHaveBeenCalledWith(expect.objectContaining({ name: "002_feature.js" }));
		expect(fixture.migrateLatest).toHaveBeenNthCalledWith(1);
		expect(fixture.migrateLatest).toHaveBeenNthCalledWith(2);
		expect(fixture.migrate.list).toHaveBeenCalledTimes(3);
	});

	it("fails if resume attempts to execute an already recorded migration", async () => {
		const fixture = migrationFixture();
		fixture.migrateLatest.mockImplementationOnce(async () => [2, fixture.planned]);

		await expect(
			verifyMigrationResume({ database: fixture.database, migrateLatest: fixture.migrateLatest }),
		).rejects.toThrow("Resume migration list mismatch");
	});

	it("refuses a non-fresh database instead of producing a misleading result", async () => {
		const database = {
			migrate: {
				list: vi.fn(async () => [[{ name: "001_initial.js" }], [{ file: "002_feature.js" }]]),
			},
		};

		await expect(verifyMigrationResume({ database, migrateLatest: vi.fn() })).rejects.toThrow(
			"requires a fresh database",
		);
	});
});
