import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Knex from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../logger.js", () => ({ migrate: { info: vi.fn(), warn: vi.fn() } }));

import { down, up } from "../../migrations/20261123000000_add_analytics_event_key.js";
import {
	down as downIngestState,
	up as upIngestState,
} from "../../migrations/20261123000001_add_analytics_ingestion_state.js";

let directory;
let knex;
beforeEach(async () => {
	directory = fs.mkdtempSync(join(tmpdir(), "shieldpm-analytics-event-key-"));
	knex = Knex({
		client: "better-sqlite3",
		connection: { filename: join(directory, "database.sqlite") },
		useNullAsDefault: true,
	});
	await knex.schema.createTable("analytics_logs", (table) => {
		table.increments("id");
		table.integer("host_id").notNullable();
		table.string("time");
		table.string("path");
	});
});
afterEach(async () => {
	await knex.destroy();
	fs.rmSync(directory, { force: true, recursive: true });
});

describe("analytics event key migration", () => {
	it("keeps legacy rows and enforces idempotent event keys without breaking NULL legacy values", async () => {
		await knex("analytics_logs").insert([
			{ host_id: 1, path: "/legacy-a", time: "2026-11-23T10:00:00.000Z" },
			{ host_id: 1, path: "/legacy-b", time: "2026-11-23T10:00:01.000Z" },
		]);

		await up(knex);

		expect(await knex.schema.hasColumn("analytics_logs", "event_key")).toBe(true);
		expect(await knex("analytics_logs").orderBy("id")).toHaveLength(2);
		await knex("analytics_logs").insert({ event_key: "a".repeat(64), host_id: 1, path: "/new" });
		await expect(
			knex("analytics_logs").insert({ event_key: "a".repeat(64), host_id: 1, path: "/duplicate" }),
		).rejects.toThrow();
		await knex("analytics_logs").insert([
			{ event_key: null, host_id: 1, path: "/null-a" },
			{ event_key: null, host_id: 1, path: "/null-b" },
		]);
		expect(Number((await knex("analytics_logs").count("* as total").first()).total)).toBe(5);

		await down(knex);

		expect(await knex.schema.hasColumn("analytics_logs", "event_key")).toBe(false);
	});

	it("stores a single persisted offset per analytics stream", async () => {
		await upIngestState(knex);
		await knex("analytics_ingest_state").insert({
			byte_offset: 10,
			file_size: 10,
			stream: "json_access",
			updated_at: 1,
		});
		await expect(
			knex("analytics_ingest_state").insert({ byte_offset: 20, stream: "json_access", updated_at: 2 }),
		).rejects.toThrow();
		await downIngestState(knex);
		expect(await knex.schema.hasTable("analytics_ingest_state")).toBe(false);
	});
});
