import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	db: null,
	directory: null,
	queue: Promise.resolve(),
	failure: null,
	audit: vi.fn(),
	autoPush: vi.fn(),
	stopPolling: vi.fn(),
	runningConfig: null,
	model: async (table) => {
		const { Model } = await import("objection");
		class Host extends Model {
			static get tableName() {
				return table;
			}
		}
		return {
			query: (trx) => Host.query(trx || state.db),
			transaction: (callback) => state.db.transaction(callback),
		};
	},
}));
vi.mock("../../models/proxy_host.js", async () => ({ default: await state.model("proxy_host") }));
vi.mock("../../models/dead_host.js", async () => ({ default: await state.model("dead_host") }));
vi.mock("../../models/redirection_host.js", async () => ({ default: await state.model("redirection_host") }));
vi.mock("../../models/stream.js", async () => ({ default: await state.model("stream") }));
vi.mock("../../models/access_list.js", () => ({ default: {} }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: state.audit } }));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: state.autoPush } }));
vi.mock("../../internal/git-deploy.js", () => ({ default: { stopPolling: state.stopPolling } }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: {} }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: vi.fn() }));
vi.mock("../../lib/config.js", () => ({ isPostgres: () => false }));
vi.mock("../../internal/nginx.js", () => {
	const filename = (kind, id) => path.join(state.directory, `${kind}-${id}.conf`);
	return {
		default: {
			withConfigurationLock: (callback) => {
				const result = state.queue.then(callback);
				state.queue = result.catch(() => {});
				return result;
			},
			getConfigName: filename,
			backupConfig: async (kind, row) => {
				const file = filename(kind, row.id);
				if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
			},
			restoreConfig: async (kind, row) => fs.renameSync(`${filename(kind, row.id)}.bak`, filename(kind, row.id)),
			deleteBackupConfig: async (kind, row) => fs.rmSync(`${filename(kind, row.id)}.bak`, { force: true }),
			deleteConfig: async (kind, row) => {
				fs.rmSync(filename(kind, row.id), { force: true });
				if (state.failure === "delete") {
					state.failure = null;
					throw new Error("delete failed");
				}
			},
			reload: async () => {
				if (state.failure === "reload") {
					state.failure = null;
					throw new Error("reload failed");
				}
				state.runningConfig = fs
					.readdirSync(state.directory)
					.filter((file) => file.endsWith(".conf"))
					.sort();
			},
		},
	};
});

import dead from "../../internal/dead-host.js";
import proxy from "../../internal/proxy-host.js";
import redirect from "../../internal/redirection-host.js";
import stream from "../../internal/stream.js";

const services = { proxy_host: proxy, dead_host: dead, redirection_host: redirect, stream };
const cases = Object.entries(services).flatMap(([kind, service]) =>
	["disable", "delete"].map((action) => ({ kind, service, action })),
);
const access = { can: vi.fn() };

describe.each(cases)("$kind $action keeps database and active config consistent", ({ kind, service, action }) => {
	let filename;
	beforeEach(async () => {
		vi.clearAllMocks();
		state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
		state.directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-host-removal-"));
		state.queue = Promise.resolve();
		state.failure = null;
		await state.db.schema.createTable(kind, (table) => {
			table.increments("id");
			table.integer("enabled");
			table.integer("is_deleted");
			table.integer("access_list_id");
		});
		await state.db(kind).insert({ id: 7, enabled: 1, is_deleted: 0, access_list_id: 0 });
		filename = path.join(state.directory, `${kind}-7.conf`);
		fs.writeFileSync(filename, "original listener");
		state.runningConfig = [path.basename(filename)];
		vi.spyOn(service, "get").mockImplementation(async () => state.db(kind).where("id", 7).first());
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await state.db.destroy();
		fs.rmSync(state.directory, { recursive: true, force: true });
	});

	it.each(["delete", "reload", "database"])("restores prior flags and listener after %s failure", async (failure) => {
		if (failure === "database")
			await state.db.raw(
				`CREATE TRIGGER reject_patch BEFORE UPDATE ON ${kind} BEGIN SELECT RAISE(ABORT, 'database failed'); END`,
			);
		else state.failure = failure;
		await expect(service[action](access, { id: 7 })).rejects.toThrow(`${failure} failed`);
		expect(await state.db(kind).where("id", 7).first()).toMatchObject({ enabled: 1, is_deleted: 0 });
		expect(fs.readFileSync(filename, "utf8")).toBe("original listener");
		expect(state.runningConfig).toEqual([path.basename(filename)]);
		expect(state.audit).not.toHaveBeenCalled();
		expect(state.autoPush).not.toHaveBeenCalled();
		expect(state.stopPolling).not.toHaveBeenCalled();
	});

	it("commits the requested flag and removes the backup after a successful reload", async () => {
		await expect(service[action](access, { id: 7 })).resolves.toBe(true);
		expect(await state.db(kind).where("id", 7).first()).toMatchObject(
			action === "delete" ? { is_deleted: 1 } : { enabled: 0 },
		);
		expect(fs.existsSync(filename)).toBe(false);
		expect(fs.existsSync(`${filename}.bak`)).toBe(false);
		expect(state.runningConfig).toEqual([]);
		expect(state.audit).toHaveBeenCalledOnce();
	});

	it("does not resurrect a stale backup when there was no current config", async () => {
		fs.rmSync(filename);
		fs.writeFileSync(`${filename}.bak`, "stale listener");
		state.failure = "reload";
		await expect(service[action](access, { id: 7 })).rejects.toThrow("reload failed");
		expect(fs.existsSync(filename)).toBe(false);
		expect(await state.db(kind).where("id", 7).first()).toMatchObject({ enabled: 1, is_deleted: 0 });
	});
});
