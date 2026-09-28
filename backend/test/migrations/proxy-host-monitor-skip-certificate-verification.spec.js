import knex from "knex";
import { describe, expect, it, vi } from "vitest";
import * as skipCertificateVerification from "../../migrations/20260924000000_add_proxy_host_monitor_skip_certificate_verification.js";
import { createPostgres } from "../helpers/postgres.js";

vi.mock("../../logger.js", () => ({ migrate: { info: vi.fn() } }));

describe("monitor certificate verification migration", () => {
	it.each(["sqlite", "postgres"])(
		"preserves existing %s monitors and defaults to strict verification",
		async (engine) => {
			const embedded = engine === "postgres" ? await createPostgres() : null;
			const db =
				embedded?.database ||
				knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
			try {
				await db.schema.createTable("proxy_host_monitor", (table) => {
					table.increments("id").primary();
					table.integer("host_id").notNullable();
				});
				await db("proxy_host_monitor").insert({ host_id: 42 });
				await skipCertificateVerification.up(db);
				expect(
					(await db("proxy_host_monitor").where({ host_id: 42 }).first()).skip_certificate_verification,
				).toBe(engine === "sqlite" ? 0 : false);
				await db("proxy_host_monitor").where({ host_id: 42 }).update({ skip_certificate_verification: true });
				await skipCertificateVerification.up(db);
				expect(
					(await db("proxy_host_monitor").where({ host_id: 42 }).first()).skip_certificate_verification,
				).toBe(engine === "sqlite" ? 1 : true);
				await skipCertificateVerification.down(db);
				expect(await db.schema.hasColumn("proxy_host_monitor", "skip_certificate_verification")).toBe(false);
				expect((await db("proxy_host_monitor").where({ host_id: 42 }).first()).host_id).toBe(42);
			} finally {
				if (embedded) await embedded.close();
				else await db.destroy();
			}
		},
		30000,
	);
});
