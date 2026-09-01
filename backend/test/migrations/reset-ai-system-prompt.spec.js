import Knex from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { down, up } from "../../migrations/20260110000000_reset_ai_system_prompt.js";

describe("reset AI system prompt migration", () => {
	let knex;

	beforeEach(async () => {
		knex = Knex({
			client: "better-sqlite3",
			connection: { filename: ":memory:" },
			useNullAsDefault: true,
		});
		await knex.schema.createTable("setting", (table) => {
			table.string("id").primary();
			table.json("meta").notNullable();
		});
	});

	afterEach(async () => {
		await knex.destroy();
	});

	it("removes only the old prompt and is safe to retry", async () => {
		await knex("setting").insert([
			{
				id: "ai-config",
				meta: JSON.stringify({ enabled: true, nested: { value: 1 }, system_prompt: "old prompt" }),
			},
			{
				id: "other-config",
				meta: JSON.stringify({ system_prompt: "leave me alone" }),
			},
		]);

		await up(knex);
		await up(knex);

		const aiConfig = await knex("setting").where("id", "ai-config").first();
		const otherConfig = await knex("setting").where("id", "other-config").first();
		expect(JSON.parse(aiConfig.meta)).toEqual({ enabled: true, nested: { value: 1 } });
		expect(JSON.parse(otherConfig.meta)).toEqual({ system_prompt: "leave me alone" });
		await expect(down(knex)).resolves.toBeUndefined();
	});

	it("handles PostgreSQL-style decoded JSON without dialect-specific SQL", async () => {
		const update = vi.fn().mockResolvedValue(1);
		const first = vi.fn().mockResolvedValue({
			meta: { enabled: false, model: "gemini", system_prompt: "old prompt" },
		});
		const where = vi.fn(() => ({ first, update }));
		const database = vi.fn(() => ({ where }));

		await up(database);

		expect(database).toHaveBeenCalledTimes(2);
		expect(database).toHaveBeenNthCalledWith(1, "setting");
		expect(database).toHaveBeenNthCalledWith(2, "setting");
		expect(where).toHaveBeenNthCalledWith(1, "id", "ai-config");
		expect(where).toHaveBeenNthCalledWith(2, "id", "ai-config");
		expect(update).toHaveBeenCalledWith({
			meta: JSON.stringify({ enabled: false, model: "gemini" }),
		});
	});

	it("is safe when the setting or prompt is absent", async () => {
		await expect(up(knex)).resolves.toBeUndefined();

		await knex("setting").insert({ id: "ai-config", meta: JSON.stringify({ enabled: false }) });
		await expect(up(knex)).resolves.toBeUndefined();
		expect(JSON.parse((await knex("setting").where("id", "ai-config").first()).meta)).toEqual({ enabled: false });
	});
});
