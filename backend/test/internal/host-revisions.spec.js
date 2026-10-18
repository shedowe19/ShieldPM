import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Model } from "objection";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accessListFiles } from "../../lib/access-list-files.js";
import { global as logger } from "../../logger.js";
import { createPostgres } from "../helpers/postgres.js";

const state = vi.hoisted(() => ({ db: null, engine: "sqlite" }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({
	getEncryptionKey: () => "1".repeat(64),
	isSqlite: () => state.engine === "sqlite",
	isPostgres: () => state.engine === "postgres",
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/firewall-policy.js", () => ({
	validateHostFirewall: vi.fn(),
	withFirewallReferences: (_next, _previous, callback) => callback(),
}));
vi.mock("../../lib/host-domain-claims.js", () => ({
	withHostDomainClaims: (_options, callback) => state.db.transaction(callback),
}));
vi.mock("../../internal/proxy-host.js", () => ({ reconcileRestoredHost: vi.fn() }));
vi.mock("../../internal/host.js", () => ({
	default: {
		validateReferences: vi.fn(),
		validateDomainNames: vi.fn(),
		isHostnameTaken: vi.fn().mockResolvedValue({ is_taken: false }),
	},
}));
vi.mock("../../internal/upload-relay.js", () => ({ validateRelayConfigForHost: vi.fn() }));
vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));

import service, { captureHostState, redactRevision } from "../../internal/host-revisions.js";
import nginx from "../../internal/nginx.js";
import { up } from "../../migrations/20261017190500_host_revisions.js";
import Revision from "../../models/proxy_host_revision.js";

const access = (userId = 1, visibility = "user") => ({
	token: { getUserId: () => userId },
	can: vi.fn().mockResolvedValue({ permission_visibility: visibility }),
});
describe.each(["sqlite", "postgres"])("host revisions with %s", (engine) => {
	let embedded;
	let directory;
	let config;
	beforeAll(async () => {
		state.engine = engine;
		if (engine === "postgres") {
			embedded = await createPostgres();
			state.db = embedded.database;
			Model.knex(state.db);
		}
		await up(state.db);
		await state.db.schema.createTable("proxy_host", (t) => {
			t.increments("id");
			t.integer("owner_user_id");
			t.integer("access_list_id");
			t.integer("certificate_id");
			t.boolean("is_deleted").defaultTo(false);
			t.boolean("enabled").defaultTo(true);
			t.string("forward_host");
			t.string("forward_scheme");
			t.integer("forward_port");
			for (const field of [
				"advanced_config",
				"terminal_password",
				"meta",
				"domain_names",
				"locations",
				"anubis_rules",
			])
				t.text(field);
			for (const field of ["created_on", "modified_on", "maintenance_start", "maintenance_end"])
				t.string(field).nullable();
		});
		await state.db.schema.createTable("host_domain", (t) => {
			t.increments("id");
			t.integer("proxy_host_id");
			t.string("domain_name");
			t.string("created_on");
			t.string("modified_on");
		});
		await state.db.schema.createTable("access_list", (t) => {
			t.increments("id");
			t.boolean("is_deleted");
			t.text("meta");
		});
		await state.db.schema.createTable("access_list_auth", (t) => {
			t.increments("id");
			t.integer("access_list_id");
			t.string("username");
			t.string("password");
		});
		await state.db.schema.createTable("access_list_client", (t) => {
			t.increments("id");
			t.integer("access_list_id");
			t.string("address");
			t.string("directive");
		});
		await state.db.schema.createTable("certificate", (t) => {
			t.increments("id");
			t.boolean("is_deleted");
			t.string("provider");
		});
	});
	beforeEach(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-revisions-"));
		vi.stubEnv("DATA_PATH", directory);
		config = path.join(directory, "1.conf");
		vi.spyOn(nginx, "getConfigName").mockReturnValue(config);
		await fs.writeFile(config, "# previous valid configuration\n", { mode: 0o640 });
		for (const table of [
			"proxy_host_revision",
			"host_domain",
			"proxy_host",
			"access_list_auth",
			"access_list_client",
			"access_list",
			"certificate",
		])
			await state.db(table).delete();
		await state.db("proxy_host").insert({
			id: 1,
			owner_user_id: 1,
			access_list_id: 0,
			certificate_id: 0,
			forward_host: "old.internal",
			forward_scheme: "http",
			forward_port: 80,
			advanced_config: "proxy_set_header Authorization SUPERSECRET;",
			terminal_password: "SECRET-ENCRYPTED-PASSWORD",
			meta: JSON.stringify({ wasm: { configuration: { authorization: "SECRET" } } }),
			domain_names: "[]",
			locations: "[]",
		});
		await state.db("host_domain").insert({ id: 1, proxy_host_id: 1, domain_name: "example.test" });
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		await fs.rm(directory, { recursive: true, force: true });
	});
	afterAll(async () => {
		if (embedded) await embedded.close();
		else await state.db.destroy();
	});
	it("stores attributed encrypted versions and returns redacted structured diffs", async () => {
		const first = await service.record(access(), 1, "created");
		const stored = await Revision.query().findById(first.id);
		expect(stored.encrypted_snapshot).not.toContain("SUPERSECRET");
		expect(first.actor_user_id).toBe(1);
		await state
			.db("proxy_host")
			.where("id", 1)
			.update({ forward_host: "new.internal", advanced_config: "changed SECRET" });
		const plan = await service.plan(access(), 1, first.id);
		expect(plan.changes).toContainEqual({ field: "forward_host", before: "new.internal", after: "old.internal" });
		expect(JSON.stringify(plan)).not.toContain("SUPERSECRET");
		expect(JSON.stringify(plan)).not.toContain("SECRET-ENCRYPTED");
		expect(redactRevision({ access_token: "secret", nested: { configuration: { arbitrary: "secret" } } })).toEqual({
			access_token: "[REDACTED]",
			nested: { configuration: "[REDACTED]" },
		});
		expect((await service.list(access(), 1))[0]).not.toHaveProperty("encrypted_snapshot");
	});
	it("hides other owners and unknown revision IDs", async () => {
		const revision = await service.record(access(), 1);
		await expect(service.list(access(2), 1)).rejects.toMatchObject({ status: 404 });
		await expect(service.plan(access(2), 1, revision.id)).rejects.toMatchObject({ status: 404 });
		await expect(service.plan(access(), 1, revision.id + 10000)).rejects.toMatchObject({ status: 404 });
	});
	it("rejects stale plans before activation", async () => {
		const revision = await service.record(access(), 1);
		const plan = await service.plan(access(), 1, revision.id);
		await fs.writeFile(config, "# external change\n");
		const configure = vi.spyOn(nginx, "configureHost");
		await expect(service.restore(access(), 1, revision.id, plan.expected_fingerprint)).rejects.toThrow(
			"changed since",
		);
		expect(configure).not.toHaveBeenCalled();
		expect(await fs.readFile(config, "utf8")).toBe("# external change\n");
	});
	it("rejects changed shared authorization bytes without rolling back other hosts", async () => {
		const authPath = accessListFiles({ id: 985019 }).auth;
		expect(path.relative(directory, authPath)).toBe(path.join("access", "985019"));
		await fs.mkdir(path.dirname(authPath), { recursive: true });
		await fs.writeFile(authPath, "previous:hash\n");
		try {
			await state.db("access_list").insert({ id: 985019, is_deleted: false, meta: "{}" });
			await state.db("proxy_host").where("id", 1).update({ access_list_id: 985019 });
			const snapshot = await captureHostState(1);
			expect(snapshot.files.every((file) => file.path.startsWith(`${directory}${path.sep}`))).toBe(true);
			const revision = await service.record(access(), 1);
			const plan = await service.plan(access(), 1, revision.id);
			await fs.writeFile(authPath, "rotated:hash\n");
			await expect(service.plan(access(), 1, revision.id)).rejects.toThrow("shared resource separately");
			await expect(service.restore(access(), 1, revision.id, plan.expected_fingerprint)).rejects.toThrow(
				"changed since",
			);
			expect(await fs.readFile(authPath, "utf8")).toBe("rotated:hash\n");
		} finally {
			await fs.rm(authPath, { force: true });
		}
	});
	it("rejects changed shared DB access rules even when authorization file bytes are unchanged", async () => {
		await state.db("access_list").insert({ id: 985020, is_deleted: false, meta: "{}" });
		await state.db("proxy_host").where("id", 1).update({ access_list_id: 985020 });
		const revision = await service.record(access(), 1);
		await state
			.db("access_list")
			.where("id", 985020)
			.update({ meta: JSON.stringify({ auth_type: "oidc" }) });
		await expect(service.plan(access(), 1, revision.id)).rejects.toThrow("access-list rules changed");
		const current = await captureHostState(1);
		await expect(service.restore(access(), 1, revision.id, current.fingerprint)).rejects.toThrow(
			"access-list rules changed",
		);
	});
	it("retains at most one hundred complete versions per host", async () => {
		for (let index = 0; index < 103; index++) {
			await state
				.db("proxy_host")
				.where("id", 1)
				.update({ forward_host: `revision-${index}.internal` });
			await service.record(access(), 1);
		}
		expect(await service.list(access(), 1)).toHaveLength(100);
		expect(await Revision.query().where("host_id", 1).resultSize()).toBe(100);
	}, 20_000);

	it("restores the chosen revision through validated activation", async () => {
		const revision = await service.record(access(), 1);
		await state.db("proxy_host").where("id", 1).update({ forward_host: "new.internal" });
		const plan = await service.plan(access(), 1, revision.id);
		vi.spyOn(nginx, "configureHost").mockImplementation(async () => {
			expect((await state.db("proxy_host").where("id", 1).first()).forward_host).toBe("old.internal");
			await fs.writeFile(config, "# validated revision\n");
			return { nginx_online: true, nginx_err: null };
		});
		const restored = await service.restore(access(), 1, revision.id, plan.expected_fingerprint);
		expect(restored.action).toBe("restored");
		expect(await service.list(access(), 1)).toHaveLength(2);
	});
	it("restores DB, domains, exact bytes and permissions after rejected activation", async () => {
		const revision = await service.record(access(), 1);
		await state.db("proxy_host").where("id", 1).update({ forward_host: "keep.internal" });
		await state.db("host_domain").where("proxy_host_id", 1).update({ domain_name: "keep.test" });
		const previous = await captureHostState(1);
		const plan = await service.plan(access(), 1, revision.id);
		vi.spyOn(nginx, "configureHost").mockImplementation(async () => {
			await fs.writeFile(config, "INVALID");
			throw new Error("Nginx rejected revision");
		});
		const reload = vi.spyOn(nginx, "reload").mockResolvedValue("");
		await expect(service.restore(access(), 1, revision.id, plan.expected_fingerprint)).rejects.toThrow(
			"Nginx rejected revision",
		);
		expect(await captureHostState(1)).toMatchObject({
			host: { forward_host: "keep.internal", domain_names: ["keep.test"] },
			files: previous.files,
		});
		expect(reload).toHaveBeenCalledOnce();
		expect(await service.list(access(), 1)).toHaveLength(1);
	});
	it("retains both errors privately when a rejected revision cannot restore its database state", async () => {
		const revision = await service.record(access(), 1);
		await state.db("proxy_host").where("id", 1).update({ forward_host: "keep.internal" });
		const plan = await service.plan(access(), 1, revision.id);
		const activation = new Error("Nginx rejected SECRET revision");
		const rollback = Object.assign(new Error("UPDATE proxy_host SET meta='SECRET' failed"), {
			name: "DBError",
			nativeError: { code: "ER_BAD_FIELD_ERROR", errno: 1054, sqlState: "42S22", sql: "SECRET" },
		});
		vi.spyOn(nginx, "configureHost").mockImplementation(async () => {
			vi.spyOn(state.db, "transaction").mockRejectedValueOnce(rollback);
			throw activation;
		});
		const reload = vi.spyOn(nginx, "reload").mockResolvedValue("");
		const log = vi.spyOn(logger, "error").mockImplementation(() => {});
		const error = await service
			.restore(access(), 1, revision.id, plan.expected_fingerprint)
			.catch((error) => error);
		expect(error).toMatchObject({ name: "InternalError", public: false, previous: activation, cause: rollback });
		expect(error.message).toContain("rollback failed");
		expect(JSON.stringify(error)).not.toContain("SECRET");
		expect(JSON.stringify(log.mock.calls)).toContain("ER_BAD_FIELD_ERROR");
		expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
		expect(reload).not.toHaveBeenCalled();
		expect(await service.list(access(), 1)).toHaveLength(1);
	});
});
