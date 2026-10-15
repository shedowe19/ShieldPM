import { randomUUID } from "node:crypto";
import knex from "knex";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null }));
vi.mock("../../models/analytics_logs.js", () => ({ default: { knex: () => state.db, tableName: "analytics_logs" } }));
vi.mock("../../models/analytic_count.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../logger.js", () => ({ analytics: { error: vi.fn() }, migrate: { info: vi.fn(), warn: vi.fn() } }));

import { AnalyticsService } from "../../internal/analytics.js";
import { up as createLogs } from "../../migrations/20251231000000_analytics_logs.js";
import { down, up } from "../../migrations/20261015000002_widen_analytics_log_bytes.js";

const suite = process.env.SHIELDPM_TEST_MARIADB === "1" ? describe : describe.skip;
suite("MariaDB analytics downloaded bytes migration", () => {
	it("widens populated details and persists large downloads with neighboring requests through rollback", async () => {
		const databaseName = `shieldpm_bytes_${randomUUID().replaceAll("-", "")}`;
		const connection = {
			host: process.env.SHIELDPM_TEST_MARIADB_HOST || "127.0.0.1",
			password: process.env.SHIELDPM_TEST_MARIADB_PASSWORD || "",
			port: Number(process.env.SHIELDPM_TEST_MARIADB_PORT || 3306),
			user: process.env.SHIELDPM_TEST_MARIADB_USER || "root",
		};
		const admin = knex({ client: "mysql2", connection });
		let db;
		try {
			await admin.raw("CREATE DATABASE ??", [databaseName]);
			db = knex({ client: "mysql2", connection: { ...connection, database: databaseName } });
			state.db = db;
			await createLogs(db);
			await db("analytics_logs").insert({
				host_id: 7,
				time: "2026-10-15T10:00:00Z",
				path: "/existing",
				bytes: 123,
			});
			await up(db);
			const service = new AnalyticsService();
			for (const [path, bytes] of [
				["/before", 10],
				["/download", 3 * 1024 ** 3],
				["/after", 20],
			]) {
				service.processLine(
					JSON.stringify({
						request_uri: path,
						body_bytes_sent: bytes,
						status: 200,
						time_iso8601: "2026-10-15T10:00:00Z",
					}),
				);
			}
			await service.flushDetailedLogs(service.detailedLogBuffer);
			expect((await db("analytics_logs").orderBy("id")).map((row) => [row.path, Number(row.bytes)])).toEqual([
				["/existing", 123],
				["/before", 10],
				["/download", 3221225472],
				["/after", 20],
			]);
			expect((await db("analytics_logs").columnInfo()).bytes.type).toBe("bigint");
			await down(db);
			expect(Number((await db("analytics_logs").where("path", "/download").first()).bytes)).toBe(3221225472);
		} finally {
			await db?.destroy();
			try {
				await admin.raw("DROP DATABASE IF EXISTS ??", [databaseName]);
			} finally {
				await admin.destroy();
			}
		}
	}, 30_000);
});
