import { randomUUID } from "node:crypto";
import knex from "knex";
import { afterEach, describe, expect, it, vi } from "vitest";
import { up as createAnalyticsLogs } from "../../migrations/20251231000000_analytics_logs.js";
import { up as widenBytes } from "../../migrations/20261123150000_widen_analytics_log_bytes.js";

vi.mock("../../logger.js", () => ({ migrate: { info: vi.fn(), warn: vi.fn() } }));

const shouldRunMariaDb = process.env.SHIELDPM_TEST_MARIADB === "1";
const databases = [];
const connection = {
	host: process.env.SHIELDPM_TEST_MARIADB_HOST || "127.0.0.1",
	password: process.env.SHIELDPM_TEST_MARIADB_PASSWORD || "",
	port: Number(process.env.SHIELDPM_TEST_MARIADB_PORT || 3306),
	user: process.env.SHIELDPM_TEST_MARIADB_USER || "root",
};

afterEach(async () => {
	const admin = knex({ client: "mysql2", connection });
	try {
		for (const databaseName of databases.splice(0)) {
			await admin.raw("DROP DATABASE IF EXISTS ??", [databaseName]);
		}
	} finally {
		await admin.destroy();
	}
});

const mariaDb = shouldRunMariaDb ? describe : describe.skip;

mariaDb("analytics log byte width on MariaDB", () => {
	it("accepts a single response larger than the signed 32-bit range", async () => {
		const databaseName = `shieldpm_analytics_bytes_${randomUUID().replaceAll("-", "")}`;
		databases.push(databaseName);
		const admin = knex({ client: "mysql2", connection });
		const database = knex({ client: "mysql2", connection: { ...connection, database: databaseName } });
		try {
			await admin.raw("CREATE DATABASE ??", [databaseName]);
			await createAnalyticsLogs(database);

			const row = {
				bytes: 2_978_391_582,
				created_at: Date.now(),
				host_id: 1,
				time: "2026-11-23T14:00:00.000Z",
			};
			expect((await database("analytics_logs").columnInfo()).bytes.type).not.toMatch(/bigint/i);

			await widenBytes(database);

			expect((await database("analytics_logs").columnInfo()).bytes.type).toMatch(/bigint/i);
			await database("analytics_logs").insert(row);
			expect(await database("analytics_logs").select("bytes").first()).toMatchObject({ bytes: 2_978_391_582 });
		} finally {
			await database.destroy();
			await admin.destroy();
		}
	}, 30_000);
});
