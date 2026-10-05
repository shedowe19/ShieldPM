import fs from "node:fs/promises";
import path from "node:path";
import { Model } from "objection";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPostgres } from "../helpers/postgres.js";
import { backendSourcePath } from "../helpers/source-path.js";

const mocks = vi.hoisted(() => ({ files: new Map(), database: undefined }));
vi.mock("../../db.js", () => ({ default: () => mocks.database }));
vi.mock("../../lib/config.js", () => ({ isDemoMode: () => false, isPostgres: () => true, isSqlite: () => false }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: vi.fn(), decrypt: vi.fn() }));
vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
	migrate: { info: vi.fn(), warn: vi.fn() },
}));
vi.mock("node:fs", () => ({
	default: {
		existsSync: (filename) =>
			mocks.files.has(filename) || [...mocks.files.keys()].some((name) => name.startsWith(`${filename}/`)),
		promises: {
			readdir: async (directory) =>
				[...mocks.files.keys()]
					.filter((filename) => filename.startsWith(`${directory}/`))
					.map((filename) => filename.slice(directory.length + 1))
					.filter((filename) => !filename.includes("/")),
			readFile: async (filename) => mocks.files.get(filename),
		},
	},
}));
vi.mock("../../lib/gitops-files.js", () => ({
	assertSafeConfigTree: vi.fn(),
	assertNoSymlinkPath: vi.fn(),
}));
vi.mock("../../internal/nginx.js", () => ({
	default: {
		withConfigurationLock: (callback) => callback(),
		bulkGenerateConfigGroups: vi.fn(),
		reload: vi.fn(),
		deleteConfig: vi.fn(),
	},
}));
vi.mock("../../internal/proxy-host-monitor.js", () => ({
	assertMonitorConfig: vi.fn(),
	default: { resetHost: vi.fn() },
}));

import gitops from "../../internal/gitops.js";
import { withImportedIdSequence } from "../../lib/gitops-sequences.js";
import AccessList from "../../models/access_list.js";
import FirewallList from "../../models/firewall_list.js";
import ProxyHost from "../../models/proxy_host.js";
import Setting from "../../models/setting.js";
import User from "../../models/user.js";

const access = { can: vi.fn().mockResolvedValue(true), token: { getUserId: () => 1 } };
const listData = { name: "Restored", reason: "Operator rule", entries: "203.0.113.10" };
const file = (directory, data) =>
	mocks.files.set(`/data/gitops/shieldpm-config/${directory}/1.yaml`, JSON.stringify(data));
const createList = () =>
	FirewallList.query().insertAndFetch({
		...listData,
		owner_user_id: 1,
		description: "",
		source_url: "",
	});

describe("GitOps PostgreSQL restore sequences", () => {
	let embedded;
	beforeAll(async () => {
		embedded = await createPostgres();
		mocks.database = embedded.database;
		Model.knex(mocks.database);
		const directory = backendSourcePath("migrations");
		for (const filename of (await fs.readdir(directory)).filter((name) => name.endsWith(".js")).sort()) {
			await (await import(path.join(directory, filename))).up(mocks.database);
		}
	}, 30000);
	afterAll(async () => embedded?.close());
	beforeEach(async () => {
		vi.clearAllMocks();
		mocks.files.clear();
		await mocks.database.raw(
			'TRUNCATE "firewall_list", "proxy_host", "host_domain", "user", "user_permission", "access_list", "access_list_auth", "access_list_client" RESTART IDENTITY CASCADE',
		);
	});
	it.each([false, true])(
		"restores explicit list IDs then accepts normal creates, overwrite=%s",
		async (overwrite) => {
			file("firewall-lists", { id: 1, owner_user_id: 1, ...listData });
			expect(await gitops.importConfig(access, { overwrite })).toMatchObject({
				success: true,
				imported: 1,
				errors: [],
			});
			if (overwrite)
				expect(await gitops.importConfig(access, { overwrite })).toMatchObject({
					success: true,
					imported: 1,
					errors: [],
				});
			expect((await FirewallList.query().findById(1)).entries).toBe(listData.entries);
			expect((await createList()).id).toBe(2);
		},
	);
	it.each([false, true])("retains a higher unused or used sequence, is_called=%s", async (isCalled) => {
		await mocks.database.raw("SELECT setval('firewall_list_id_seq', 100, ?)", [isCalled]);
		file("firewall-lists", { id: 7, owner_user_id: 1, ...listData });
		expect((await gitops.importConfig(access)).success).toBe(true);
		expect((await createList()).id).toBe(isCalled ? 101 : 100);
	});
	it("keeps IDs of soft-deleted rows reserved after restoring a lower ID", async () => {
		await FirewallList.query().insert({
			id: 50,
			owner_user_id: 1,
			...listData,
			description: "",
			source_url: "",
			is_deleted: true,
		});
		file("firewall-lists", { id: 1, owner_user_id: 1, ...listData });
		expect((await gitops.importConfig(access)).success).toBe(true);
		expect((await createList()).id).toBe(51);
	});
	it.each([false, true])("imports sanitized graphs with new relation IDs, overwrite=%s", async (overwrite) => {
		file("users", {
			id: 7,
			name: "Restored",
			email: "restored@example.test",
			nickname: "Restored",
			avatar: "",
			roles: ["user"],
			permissions: {
				id: 99,
				user_id: 99,
				visibility: "all",
				...Object.fromEntries(
					["proxy_hosts", "redirection_hosts", "dead_hosts", "streams", "access_lists", "certificates"].map(
						(name) => [name, "manage"],
					),
				),
			},
		});
		file("access-lists", {
			id: 7,
			owner_user_id: 7,
			name: "Restored",
			items: [{ id: 99, access_list_id: 99, username: "restored", password: "hash", meta: {} }],
			clients: [{ id: 99, access_list_id: 99, address: "203.0.113.10", directive: "deny", meta: {} }],
		});
		file("proxy-hosts", {
			id: 7,
			owner_user_id: 7,
			domain_names: ["restored.example.test"],
			host_domains: [{ id: 99, proxy_host_id: 99, domain_name: "injected.example.test" }],
			forward_host: "127.0.0.1",
			forward_port: 80,
			forward_scheme: "http",
			advanced_config: "",
		});
		expect(await gitops.importConfig(access, { overwrite })).toMatchObject({
			success: true,
			imported: 3,
			errors: [],
		});
		if (overwrite)
			expect(await gitops.importConfig(access, { overwrite })).toMatchObject({
				success: true,
				imported: 3,
				errors: [],
			});
		for (const [model, directory] of [
			[User, "users"],
			[AccessList, "access-lists"],
			[ProxyHost, "proxy-hosts"],
		]) {
			const data = JSON.parse(mocks.files.get(`/data/gitops/shieldpm-config/${directory}/1.yaml`));
			const nextData = gitops.sanitizeImportData(model.name, { ...data, id: undefined });
			if (model === ProxyHost) {
				nextData.host_domains = nextData.domain_names.map((domain_name) => ({ domain_name }));
				delete nextData.domain_names;
			}
			const next = await model.query().insertGraph(nextData);
			expect(next.id).toBe(8);
		}
		for (const table of ["user_permission", "access_list_auth", "access_list_client", "host_domain"]) {
			expect(await mocks.database(table).orderBy("id").pluck("id")).toEqual(overwrite ? [2, 3] : [1, 2]);
		}
		expect((await mocks.database("host_domain").first()).domain_name).toBe("restored.example.test");
	});
	it("locks the restore table before writing and keeps failed writes atomic", async () => {
		const queries = [];
		const record = ({ sql }) => queries.push(sql);
		mocks.database.on("query", record);
		try {
			await expect(
				withImportedIdSequence(FirewallList, async (transaction) => {
					await FirewallList.query(transaction).insert({
						id: 1,
						owner_user_id: 1,
						...listData,
						description: "",
						source_url: "",
					});
					throw new Error("Restore interrupted");
				}),
			).rejects.toThrow("Restore interrupted");
			const lockIndex = queries.findIndex((sql) => sql.startsWith("LOCK TABLE"));
			const writeIndex = queries.findIndex((sql) => sql.startsWith('insert into "firewall_list"'));
			expect(lockIndex).toBeGreaterThanOrEqual(0);
			expect(writeIndex).toBeGreaterThan(lockIndex);
			expect(await FirewallList.query()).toEqual([]);
			expect((await createList()).id).toBe(1);
		} finally {
			mocks.database.removeListener("query", record);
		}
	});
	it("does not change numeric non-serial or text-ID models", async () => {
		await mocks.database.schema.createTable("import_without_sequence", (table) => table.integer("id").primary());
		class WithoutSequence extends Model {
			static get tableName() {
				return "import_without_sequence";
			}
		}
		try {
			const write = vi.fn((transaction) => WithoutSequence.query(transaction).insert({ id: 7 }));
			expect((await withImportedIdSequence(WithoutSequence, write)).id).toBe(7);
			expect(write).toHaveBeenCalledExactlyOnceWith();
			const settingWrite = vi.fn(() =>
				Setting.query().insert({ id: "restore-test", name: "test", description: "", value: "test" }),
			);
			await withImportedIdSequence(Setting, settingWrite);
			expect(settingWrite).toHaveBeenCalledExactlyOnceWith();
		} finally {
			await mocks.database.schema.dropTable("import_without_sequence");
			await Setting.query().deleteById("restore-test");
		}
	});
	it.each(["better-sqlite3", "mysql", "mysql2"])("leaves %s writes unchanged", async (client) => {
		const database = { client: { config: { client } }, transaction: vi.fn() };
		const write = vi.fn().mockResolvedValue("restored");
		expect(await withImportedIdSequence({ knex: () => database }, write)).toBe("restored");
		expect(write).toHaveBeenCalledExactlyOnceWith();
		expect(database.transaction).not.toHaveBeenCalled();
	});
});
