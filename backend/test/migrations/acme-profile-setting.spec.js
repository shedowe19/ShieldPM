import knex from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as settingsTable from "../../migrations/20190227065017_settings.js";
import * as acmeProfile from "../../migrations/20260930000000_add_acme_profile_setting.js";
import { createPostgres } from "../helpers/postgres.js";

vi.mock("../../logger.js", () => ({ migrate: { info: vi.fn(), warn: vi.fn() } }));

const parseMeta = (row) => ({ ...row, meta: typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta });

describe.each(["sqlite", "postgres"])("ACME profile setting migration on %s", (engine) => {
	let embedded;
	let database;
	let existingSetting;

	beforeEach(async () => {
		embedded = engine === "postgres" ? await createPostgres() : null;
		database =
			embedded?.database ||
			knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
		await settingsTable.up(database);
		await database("setting").insert({
			id: "default-site",
			name: "Default Site",
			description: "Existing setting",
			value: "html",
			meta: JSON.stringify({ html: "<p>Existing page</p>" }),
		});
		existingSetting = await database("setting").where({ id: "default-site" }).first();
	}, 30000);

	afterEach(async () => {
		if (embedded) await embedded.close();
		else await database?.destroy();
	});

	it("inherits the environment on upgrade and preserves unrelated settings on repeated runs", async () => {
		await acmeProfile.up(database);
		expect(parseMeta(await database("setting").where({ id: "acme-profile" }).first())).toMatchObject({
			id: "acme-profile",
			value: "inherit",
			meta: {},
		});
		await acmeProfile.up(database);
		expect(await database("setting").where({ id: "acme-profile" })).toHaveLength(1);
		expect(await database("setting").where({ id: "default-site" }).first()).toEqual(existingSetting);
	});

	it("retains an already saved profile and rolls back only its own setting", async () => {
		await database("setting").insert({
			id: "acme-profile",
			name: "Previously configured profile",
			description: "Previous installation",
			value: "shortlived",
			meta: JSON.stringify({ marker: "preserve me" }),
		});
		const chosenProfile = await database("setting").where({ id: "acme-profile" }).first();
		await acmeProfile.up(database);
		await acmeProfile.up(database);
		expect(await database("setting").where({ id: "acme-profile" }).first()).toEqual(chosenProfile);

		await acmeProfile.down(database);
		await acmeProfile.down(database);
		expect(await database("setting").where({ id: "acme-profile" })).toHaveLength(0);
		expect(await database("setting").where({ id: "default-site" }).first()).toEqual(existingSetting);

		await acmeProfile.up(database);
		expect(parseMeta(await database("setting").where({ id: "acme-profile" }).first())).toMatchObject({
			value: "inherit",
			meta: {},
		});
	});
});
