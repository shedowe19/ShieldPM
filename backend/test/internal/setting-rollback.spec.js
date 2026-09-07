import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	db: null,
	directory: null,
	failure: null,
	failHtml: null,
	queue: Promise.resolve(),
}));
vi.mock("node:fs", async (original) => {
	const fs = (await original()).default;
	const translate = (name) =>
		typeof name === "string" && name.startsWith("/data/") ? path.join(state.directory, name.slice(6)) : name;
	return {
		default: {
			...fs,
			existsSync: (name) => fs.existsSync(translate(name)),
			readFileSync: (name, ...args) => fs.readFileSync(translate(name), ...args),
			writeFileSync: (name, ...args) => fs.writeFileSync(translate(name), ...args),
			mkdirSync: (name, ...args) => fs.mkdirSync(translate(name), ...args),
			rmSync: (name, ...args) => fs.rmSync(translate(name), ...args),
		},
	};
});
vi.mock("../../models/setting.js", async () => {
	const { Model } = await import("objection");
	class Setting extends Model {
		static get tableName() {
			return "setting";
		}
		static get jsonAttributes() {
			return ["meta"];
		}
	}
	return {
		default: {
			query: (trx) => Setting.query(trx || state.db),
			transaction: (callback) => state.db.transaction(callback),
		},
	};
});
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/nginx.js", () => {
	const config = () => path.join(state.directory, "default.conf");
	const fail = (stage) => {
		if (state.failure === stage) {
			state.failure = null;
			throw new Error(stage);
		}
	};
	return {
		default: {
			withConfigurationLock: (callback) => {
				const result = state.queue.then(callback);
				state.queue = result.catch(() => {});
				return result;
			},
			getConfigName: config,
			backupConfig: async () => {
				if (fs.existsSync(config())) fs.copyFileSync(config(), `${config()}.bak`);
			},
			restoreConfig: async () => fs.renameSync(`${config()}.bak`, config()),
			deleteBackupConfig: async () => fs.rmSync(`${config()}.bak`, { force: true }),
			deleteConfig: async () => fs.rmSync(config(), { force: true }),
			generateConfig: async (_kind, row) => {
				fs.writeFileSync(config(), `config:${row.value}:${row.meta.html || ""}`);
				fail("generate");
				if (row.meta.html === state.failHtml) state.failure = "test";
			},
			test: async () => fail("test"),
			reload: async () => fail("reload"),
		},
	};
});

import settings from "../../internal/setting.js";

const access = { can: vi.fn() };
const initial = {
	id: "default-site",
	name: "Default Site",
	description: "Preserved",
	value: "html",
	meta: { html: "old-html" },
};
const update = (html) =>
	settings.update(access, { id: "default-site", value: "html", meta: { html }, name: "untrusted" });

describe("default-site configuration recovery", () => {
	beforeEach(async () => {
		state.directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-settings-"));
		state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
		state.failure = null;
		state.failHtml = null;
		state.queue = Promise.resolve();
		await state.db.schema.createTable("setting", (t) => {
			t.string("id").primary();
			t.string("name");
			t.string("description");
			t.string("value");
			t.text("meta");
		});
		await state.db("setting").insert({ ...initial, meta: JSON.stringify(initial.meta) });
		fs.mkdirSync("/data/html", { recursive: true });
		fs.writeFileSync("/data/html/index.html", "old-html");
		fs.writeFileSync(path.join(state.directory, "default.conf"), "old-config");
	});
	afterEach(async () => {
		await state.db.destroy();
		fs.rmSync(state.directory, { recursive: true, force: true });
	});

	it.each(["generate", "test", "reload", "database"])(
		"restores HTML, config and database after %s fails",
		async (failure) => {
			if (failure === "database")
				await state.db.raw(
					"CREATE TRIGGER reject_setting BEFORE UPDATE ON setting BEGIN SELECT RAISE(ABORT, 'database'); END",
				);
			else state.failure = failure;
			await expect(update("new-html")).rejects.toThrow("Previous configuration restored");
			expect(await settings.get(access, { id: "default-site" })).toMatchObject(initial);
			expect(fs.readFileSync(path.join(state.directory, "default.conf"), "utf8")).toBe("old-config");
			expect(fs.readFileSync("/data/html/index.html", "utf8")).toBe("old-html");
		},
	);

	it("keeps fields from the database and removes backup only after a successful update", async () => {
		const row = await update("new-html");
		expect(row).toMatchObject({
			name: initial.name,
			description: initial.description,
			value: "html",
			meta: { html: "new-html" },
		});
		expect(fs.existsSync(path.join(state.directory, "default.conf.bak"))).toBe(false);
		expect(fs.readFileSync("/data/html/index.html", "utf8")).toBe("new-html");
	});

	it("serializes updates and restores the last successful value when the queued update fails", async () => {
		state.failHtml = "second";
		const first = update("first");
		const second = update("second");
		const results = await Promise.allSettled([first, second]);
		expect(results[0].status).toBe("fulfilled");
		expect(results[1]).toMatchObject({
			status: "rejected",
			reason: { message: expect.stringContaining("Previous configuration restored") },
		});
		expect((await settings.get(access, { id: "default-site" })).meta.html).toBe("first");
		expect(fs.readFileSync(path.join(state.directory, "default.conf"), "utf8")).toBe("config:html:first");
		expect(fs.readFileSync("/data/html/index.html", "utf8")).toBe("first");
	});

	it("does not leave new HTML or config behind when neither existed before", async () => {
		fs.rmSync("/data/html", { recursive: true });
		fs.rmSync(path.join(state.directory, "default.conf"));
		state.failure = "test";
		await expect(update("new-html")).rejects.toThrow("Previous configuration restored");
		expect(fs.existsSync("/data/html/index.html")).toBe(false);
		expect(fs.existsSync(path.join(state.directory, "default.conf"))).toBe(false);
	});
});
