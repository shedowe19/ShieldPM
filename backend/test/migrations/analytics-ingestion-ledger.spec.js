import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Knex from "knex";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { down, up } from "../../migrations/20260831231500_add_analytics_ingestion_ledger.js";

describe("analytics ingestion ledger migration", () => {
	let directory;
	let knex;

	beforeEach(() => {
		directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-analytics-ledger-"));
		knex = Knex({
			client: "better-sqlite3",
			connection: { filename: path.join(directory, "database.sqlite") },
			useNullAsDefault: true,
		});
	});

	afterEach(async () => {
		await knex.destroy();
		fs.rmSync(directory, { force: true, recursive: true });
	});

	it("creates the cross-database ledger fields and a unique batch identity", async () => {
		await up(knex);
		await up(knex);

		await knex("analytics_ingestion_batch").insert({
			batch_id: "a".repeat(64),
			payload_hash: "b".repeat(64),
			claim_token: "c".repeat(64),
			record_count: 2,
			first_sequence: 10,
			last_sequence: 11,
			status: "committed",
			created_at: "2026-08-31T20:00:00.000Z",
			committed_at: "2026-08-31T20:00:00.100Z",
		});
		await expect(
			knex("analytics_ingestion_batch").insert({
				batch_id: "a".repeat(64),
				payload_hash: "d".repeat(64),
				claim_token: "e".repeat(64),
				record_count: 1,
				first_sequence: 12,
				last_sequence: 12,
				status: "claimed",
				created_at: "2026-08-31T20:00:01.000Z",
			}),
		).rejects.toThrow();

		const columns = await knex("analytics_ingestion_batch").columnInfo();
		for (const column of [
			"batch_id",
			"payload_hash",
			"claim_token",
			"record_count",
			"first_sequence",
			"last_sequence",
			"status",
			"created_at",
			"committed_at",
		]) {
			expect(columns).toHaveProperty(column);
		}
	});

	it("rolls back cleanly", async () => {
		await up(knex);
		await down(knex);
		expect(await knex.schema.hasTable("analytics_ingestion_batch")).toBe(false);
	});
});
