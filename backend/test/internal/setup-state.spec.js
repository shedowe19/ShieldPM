import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, generate: vi.fn(), bulk: vi.fn(), writeHash: vi.fn(), hosts: [] }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({ isSqlite: () => true }));
vi.mock("../../internal/nginx.js", () => ({
	default: { generateConfig: state.generate, bulkGenerateConfigs: state.bulk },
}));
vi.mock("../../lib/certbot.js", () => ({ installPlugins: vi.fn() }));
vi.mock("../../lib/utils.js", () => ({ default: { writeHash: state.writeHash } }));
vi.mock("../../logger.js", () => ({ setup: { info: vi.fn() } }));
vi.mock("../../models/certificate.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({
	default: { query: () => ({ where: () => ({ andWhere: () => ({ withGraphFetched: async () => [] }) }) }) },
}));
vi.mock("../../models/redirection_host.js", () => ({
	default: { query: () => ({ where: () => ({ andWhere: () => ({ withGraphFetched: async () => [] }) }) }) },
}));
vi.mock("../../models/stream.js", () => ({
	default: { query: () => ({ where: () => ({ andWhere: () => ({ withGraphFetched: async () => [] }) }) }) },
}));
vi.mock("../../models/dead_host.js", () => ({
	default: { query: () => ({ where: () => ({ andWhere: () => ({ withGraphFetched: async () => state.hosts }) }) }) },
}));

vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/token.js", () => ({ default: {} }));

import users from "../../internal/user.js";
import { isSetup, regenerateAllHosts, setupDefaultSettings, setupDefaultUser } from "../../setup.js";

describe("startup preserves persisted setup state", () => {
	beforeAll(async () => {
		await state.db.schema.createTable("user", (t) => {
			t.increments("id");
			t.string("email");
			t.string("name");
			t.string("nickname");
			t.string("avatar");
			t.text("roles");
			t.integer("is_deleted");
			t.string("created_on");
			t.string("modified_on");
		});
		await state.db.schema.createTable("auth", (t) => {
			t.increments("id");
			t.integer("user_id");
			t.string("type");
			t.string("secret");
			t.text("meta");
			t.string("created_on");
			t.string("modified_on");
		});
		await state.db.schema.createTable("user_permission", (t) => {
			t.increments("id");
			t.integer("user_id");
			for (const key of [
				"visibility",
				"cloudflared_tunnels",
				"analytics",
				"proxy_hosts",
				"redirection_hosts",
				"dead_hosts",
				"streams",
				"access_lists",
				"certificates",
				"created_on",
				"modified_on",
			])
				t.string(key);
		});
		await state.db.schema.createTable("setting", (t) => {
			t.string("id").primary();
			t.string("name");
			t.string("description");
			t.string("value");
			t.text("meta");
			t.string("created_on");
			t.string("modified_on");
		});
	});
	beforeEach(async () => {
		vi.clearAllMocks();
		state.writeHash.mockReset();
		for (const table of ["user", "auth", "user_permission", "setting"]) await state.db(table).delete();
		vi.stubEnv("INITIAL_ADMIN_EMAIL", " ADMIN@Example.Test ");
		vi.stubEnv("INITIAL_ADMIN_PASSWORD", "initial-password");
	});
	afterEach(async () => {
		await state.db.raw("DROP TRIGGER IF EXISTS reject_permissions");
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});
	afterAll(async () => state.db.destroy());

	it("admits only one anonymous first-admin creation when requests race", async () => {
		await state.db("setting").insert({ id: "default-site", value: "404", meta: "{}" });
		vi.spyOn(users, "get").mockResolvedValue({ id: 1 });
		const access = { can: async () => {}, token: { getUserId: () => 0 } };
		const create = (email) =>
			users.create(access, {
				email,
				name: "Admin",
				nickname: "admin",
				roles: ["admin"],
				is_deleted: 0,
				auth: { type: "password", secret: "initial-password" },
			});
		const results = await Promise.allSettled([create("first@example.test"), create("second@example.test")]);
		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
		expect(await state.db("user")).toHaveLength(1);
	});

	it("normalizes the environment admin email to the login lookup format", async () => {
		await setupDefaultUser();
		expect((await state.db("user").first()).email).toBe("admin@example.test");
		expect(await isSetup()).toBe(true);
	});
	it("rolls back all initial account records when permission creation fails", async () => {
		await state.db.raw(
			"CREATE TRIGGER reject_permissions BEFORE INSERT ON user_permission BEGIN SELECT RAISE(ABORT, 'permissions failed'); END",
		);
		await expect(setupDefaultUser()).rejects.toThrow("permissions failed");
		expect(await state.db("user")).toHaveLength(0);
		expect(await state.db("auth")).toHaveLength(0);
		expect(await isSetup()).toBe(false);
	});
	it("renders the saved default-site value and metadata on every startup", async () => {
		await state.db("setting").insert({
			id: "default-site",
			value: "redirect",
			meta: JSON.stringify({ redirect: "https://example.test" }),
		});
		await setupDefaultSettings();
		expect(state.generate).toHaveBeenCalledWith(
			"default",
			expect.objectContaining({
				id: "default-site",
				value: "redirect",
				meta: { redirect: "https://example.test" },
			}),
		);
	});
	it("regenerates 404 hosts with their own template and config directory", async () => {
		state.hosts = [{ id: 7, domain_names: ["dead.example.test"] }];
		vi.stubEnv("REGENERATE_ALL", "true");
		await regenerateAllHosts();
		expect(state.bulk).toHaveBeenCalledWith(expect.anything(), "dead_host", state.hosts);
	});
	it("keeps startup pending until the regenerated configuration fingerprint is persisted", async () => {
		vi.stubEnv("REGENERATE_ALL", "true");
		let finishWrite;
		let settled = false;
		state.writeHash.mockImplementation(
			() =>
				new Promise((resolve) => {
					finishWrite = resolve;
				}),
		);
		const regeneration = regenerateAllHosts().then(() => {
			settled = true;
		});
		await vi.waitFor(() => expect(state.writeHash).toHaveBeenCalledOnce());
		expect(settled).toBe(false);
		finishWrite();
		await regeneration;
		expect(settled).toBe(true);
	});
	it("propagates fingerprint write failures to the startup retry handler", async () => {
		vi.stubEnv("REGENERATE_ALL", "true");
		state.writeHash.mockRejectedValue(new Error("disk full"));
		await expect(regenerateAllHosts()).rejects.toThrow("disk full");
	});
});
