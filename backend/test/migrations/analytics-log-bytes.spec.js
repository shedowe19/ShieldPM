import knex from "knex";
import { describe, expect, it, vi } from "vitest";
import { createPostgres } from "../helpers/postgres.js";

const state = vi.hoisted(() => ({ db: null }));
vi.mock("../../models/analytics_logs.js", () => ({ default: { knex: () => state.db, tableName: "analytics_logs" } }));
vi.mock("../../models/analytic_count.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../logger.js", () => ({ analytics: { error: vi.fn() }, migrate: { info: vi.fn(), warn: vi.fn() } }));

import { AnalyticsService } from "../../internal/analytics.js";
import { up as createLogs } from "../../migrations/20251231000000_analytics_logs.js";
import { down, up } from "../../migrations/20261015000002_widen_analytics_log_bytes.js";

describe("analytics downloaded bytes migration", () => {
	it.each(["sqlite", "postgres"])(
		"preserves existing %s rows and writes large downloads with their neighbors",
		async (engine) => {
			const embedded = engine === "postgres" ? await createPostgres() : null;
			const db =
				embedded?.database ||
				knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
			state.db = db;
			try {
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
				const rows = await db("analytics_logs").orderBy("id");
				expect(rows.map((row) => [row.path, Number(row.bytes)])).toEqual([
					["/existing", 123],
					["/before", 10],
					["/download", 3221225472],
					["/after", 20],
				]);
				expect((await db("analytics_logs").columnInfo()).bytes.type).toContain("bigint");
				await down(db);
				expect(Number((await db("analytics_logs").where("path", "/download").first()).bytes)).toBe(3221225472);
				await db("analytics_logs").insert({ host_id: 7, time: "2026-10-15T10:00:00Z", bytes: 4 * 1024 ** 3 });
				expect(Number((await db("analytics_logs").orderBy("id", "desc").first()).bytes)).toBe(4294967296);
				if (engine === "sqlite") {
					const indexes = await db.raw("PRAGMA index_list('analytics_logs')");
					expect(indexes.map((index) => index.name)).toEqual(
						expect.arrayContaining([
							"analytics_logs_created_at_index",
							"analytics_logs_host_id_time_index",
						]),
					);
				}
			} finally {
				if (embedded) await embedded.close();
				else await db.destroy();
			}
		},
		30_000,
	);
});
