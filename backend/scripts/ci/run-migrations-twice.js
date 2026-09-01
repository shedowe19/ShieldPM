import { fileURLToPath, pathToFileURL } from "node:url";
import db from "../../db.js";
import { migrateUp } from "../../migrate.js";

const migrationConfig = {
	directory: fileURLToPath(new URL("../../migrations/", import.meta.url)),
	tableName: "migrations",
};

const migrationName = (migration) => {
	if (typeof migration === "string") return migration;
	if (typeof migration?.name === "string") return migration.name;
	if (typeof migration?.file === "string") return migration.file;
	throw new TypeError("Knex returned a migration without a usable name");
};

const migrationNames = (migrations) => migrations.map(migrationName);

const assertExactMigrationList = (stage, actual, expected) => {
	if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
		throw new Error(
			`${stage} migration list mismatch: expected [${expected.join(", ")}], received [${actual.join(", ")}]`,
		);
	}
};

const verifyMigrationResume = async ({ database = db(), migrateLatest = migrateUp } = {}) => {
	const [initiallyCompleted, initiallyPending] = await database.migrate.list(migrationConfig);
	const plannedMigrations = migrationNames(initiallyPending);

	if (initiallyCompleted.length !== 0) {
		throw new Error("Migration verification requires a fresh database with an empty migration ledger");
	}
	if (plannedMigrations.length < 2) {
		throw new Error("Migration verification requires at least two pending migrations to exercise resume behavior");
	}

	const checkpointCount = Math.floor(plannedMigrations.length / 2);
	const checkpointName = plannedMigrations[checkpointCount - 1];
	const expectedPrefix = plannedMigrations.slice(0, checkpointCount);
	const expectedSuffix = plannedMigrations.slice(checkpointCount);
	const [, checkpointRun] = await database.migrate.to({ ...migrationConfig, name: checkpointName });
	assertExactMigrationList("Checkpoint", migrationNames(checkpointRun), expectedPrefix);

	const [completedAtCheckpoint, pendingAtCheckpoint] = await database.migrate.list(migrationConfig);
	assertExactMigrationList("Completed checkpoint", migrationNames(completedAtCheckpoint), expectedPrefix);
	assertExactMigrationList("Pending checkpoint", migrationNames(pendingAtCheckpoint), expectedSuffix);

	const [, resumeRun] = await migrateLatest();
	assertExactMigrationList("Resume", migrationNames(resumeRun), expectedSuffix);

	const [completedAfterResume, pendingAfterResume] = await database.migrate.list(migrationConfig);
	assertExactMigrationList("Completed resume", migrationNames(completedAfterResume), plannedMigrations);
	assertExactMigrationList("Pending resume", migrationNames(pendingAfterResume), []);

	const [, noOpRun] = await migrateLatest();
	assertExactMigrationList("Final no-op", migrationNames(noOpRun), []);

	return {
		checkpointCount,
		resumedCount: resumeRun.length,
		totalCount: plannedMigrations.length,
	};
};

const isDirectExecution = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
	const database = db();
	try {
		const result = await verifyMigrationResume({ database });
		process.stdout.write(
			`Migration verification passed; ${result.checkpointCount} migration(s) applied before the checkpoint, ` +
				`${result.resumedCount} resumed, and the final pass was a no-op (${result.totalCount} total).\n`,
		);
	} finally {
		await database.destroy();
	}
}

export { assertExactMigrationList, migrationName, verifyMigrationResume };
