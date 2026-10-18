import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { Model } from "objection";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPostgres } from "../helpers/postgres.js";

const state = vi.hoisted(() => ({
	db: null,
	engine: "sqlite",
	beforeClaim: null,
	access: { can: vi.fn().mockResolvedValue({ permission_visibility: "all" }), token: { getUserId: () => 1 } },
}));
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
vi.mock("../../lib/host-domain-claims.js", () => ({
	withHostDomainClaims: async (_options, callback) => {
		await state.beforeClaim?.();
		return state.db.transaction(callback);
	},
}));
vi.mock("../../internal/firewall-policy.js", () => ({
	validateHostFirewall: vi.fn(),
	assertHostFirewallGeoipAvailable: vi.fn(),
	withFirewallReferences: (_data, _old, callback) => callback(),
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: vi.fn() } }));
vi.mock("../../internal/git-deploy.js", () => ({ default: { startPollingForHost: vi.fn(), stopPolling: vi.fn() } }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: { start: vi.fn(), stop: vi.fn() } }));
vi.mock("../../internal/proxy-host-monitor.js", () => ({ default: { resetHost: vi.fn() } }));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("../../internal/proxy-host-policies.js", () => ({
	prepareProxyHostPolicies: async (data, current, requested) => {
		data.meta = { ...current.meta, ...requested };
	},
}));
vi.mock("../../internal/host.js", () => ({
	default: {
		validateReferences: vi.fn(),
		validateDomainNames: vi.fn(),
		cleanSslHstsData: (_new, data) => data,
		cleanRowCertificateMeta: (row) => row,
	},
}));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = state.access;
		next();
	},
}));
vi.mock("../../lib/validator/api.js", () => ({ default: (_schema, body) => body }));
vi.mock("../../schema/index.js", () => ({ getValidationSchema: () => ({}) }));

import nginx from "../../internal/nginx.js";
import errs from "../../lib/error.js";
import { up } from "../../migrations/20261017190500_host_revisions.js";
import router from "../../routes/nginx/proxy_hosts.js";

const oldMeta = {
	nginx_online: true,
	wasm_filters: [
		{ id: "old-filter", enabled: true, kind: "request_header", config: { header: "x-old", value: "old" } },
	],
};
describe.each(["sqlite", "postgres"])("Proxy Host activation HTTP contract with %s", (engine) => {
	let embedded;
	let directory;
	let config;
	let server;
	let origin;
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
		await state.db.schema.createTable("certificate", (t) => {
			t.increments("id");
			t.boolean("is_deleted");
		});
		await state.db.schema.createTable("user", (t) => {
			t.increments("id");
			t.boolean("is_deleted");
		});
		const app = express();
		app.use(express.json());
		app.use("/api/nginx/proxy-hosts", router);
		app.use((error, _req, res, _next) =>
			res.status(error.status || 500).json({ error: { message: error.message } }),
		);
		server = app.listen(0, "127.0.0.1");
		await new Promise((resolve) => server.once("listening", resolve));
		origin = `http://127.0.0.1:${server.address().port}`;
	});
	beforeEach(async () => {
		state.beforeClaim = null;
		state.access.can.mockResolvedValue({ permission_visibility: "all" });
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-proxy-activation-"));
		config = path.join(directory, "1.conf");
		await fs.writeFile(config, "# previous active filters\n");
		for (const table of ["proxy_host_revision", "host_domain", "proxy_host"]) await state.db(table).delete();
		await state.db("proxy_host").insert({
			id: 1,
			owner_user_id: 1,
			access_list_id: 0,
			certificate_id: 0,
			forward_host: "old.internal",
			forward_scheme: "http",
			forward_port: 80,
			advanced_config: "",
			meta: JSON.stringify(oldMeta),
			domain_names: "[]",
			locations: "[]",
		});
		await state.db("host_domain").insert({ id: 1, proxy_host_id: 1, domain_name: "old.test" });
		vi.spyOn(nginx, "getConfigName").mockReturnValue(config);
		vi.spyOn(nginx, "reload").mockResolvedValue("");
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await fs.rm(directory, { recursive: true, force: true });
	});
	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
		if (embedded) await embedded.close();
		else await state.db.destroy();
	});
	const update = async (body) => {
		const response = await fetch(`${origin}/api/nginx/proxy-hosts/1`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		return { status: response.status, body: await response.json() };
	};
	it("rejects an owner transfer occurring after the visibility read and before the final host write", async () => {
		state.access.can.mockResolvedValue({ permission_visibility: "user" });
		state.beforeClaim = async () => {
			state.beforeClaim = null;
			await state.db("proxy_host").where("id", 1).update({ owner_user_id: 2 });
		};
		const configure = vi.spyOn(nginx, "configureHost");
		expect((await update({ forward_host: "unauthorized.internal" })).status).toBe(404);
		expect(await state.db("proxy_host").where("id", 1).first()).toMatchObject({
			owner_user_id: 2,
			forward_host: "old.internal",
		});
		expect(configure).not.toHaveBeenCalled();
		expect(await fs.readFile(config, "utf8")).toBe("# previous active filters\n");
	});
	it("restores a rejected deletion without holding a database transaction during reload", async () => {
		vi.spyOn(nginx, "backupConfig").mockResolvedValue(undefined);
		vi.spyOn(nginx, "deleteConfig").mockImplementation(async () => fs.rm(config));
		nginx.reload.mockImplementationOnce(async () => {
			// This separate request would block behind an open SQLite writer transaction.
			expect(Boolean((await state.db("proxy_host").where("id", 1).first()).is_deleted)).toBe(true);
			throw new errs.ConfigurationError("reload rejected deletion");
		});
		const response = await fetch(`${origin}/api/nginx/proxy-hosts/1`, { method: "DELETE" });
		expect(response.status).toBe(400);
		expect(Boolean((await state.db("proxy_host").where("id", 1).first()).is_deleted)).toBe(false);
		expect(await fs.readFile(config, "utf8")).toBe("# previous active filters\n");
	});
	it.each(["throw", "offline"])(
		"preserves prior DB/filter/domain/config when activation reports %s",
		async (mode) => {
			vi.spyOn(nginx, "configureHost").mockImplementation(async () => {
				await fs.writeFile(config, "# failed candidate filters\n");
				if (mode === "throw") throw new errs.ConfigurationError("Wasm execution preflight failed");
				return { nginx_online: false, nginx_err: "syntax rejected" };
			});
			const response = await update({
				forward_host: "candidate.internal",
				domain_names: ["candidate.test"],
				meta: { wasm_filters: [{ id: "candidate-filter", enabled: true }] },
			});
			expect(response.status).toBe(400);
			const saved = await state.db("proxy_host").where("id", 1).first();
			expect(saved.forward_host).toBe("old.internal");
			expect(JSON.parse(saved.meta)).toEqual(oldMeta);
			expect((await state.db("host_domain").where("proxy_host_id", 1).first()).domain_name).toBe("old.test");
			expect(await fs.readFile(config, "utf8")).toBe("# previous active filters\n");
			expect(await state.db("proxy_host_revision")).toHaveLength(1);
		},
	);
	it("removes a failed new host from the active database and releases its listener", async () => {
		if (engine === "postgres")
			await state.db.raw("SELECT setval(pg_get_serial_sequence('proxy_host', 'id'), 1, true)");
		nginx.getConfigName.mockImplementation((_type, id) => path.join(directory, `${id}.conf`));
		vi.spyOn(nginx, "configureHost").mockImplementation(async (_model, _type, host) => {
			await fs.writeFile(nginx.getConfigName("proxy_host", host.id), "candidate");
			throw new errs.ConfigurationError("Wasm execution failed");
		});
		const response = await fetch(`${origin}/api/nginx/proxy-hosts`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				domain_names: ["new.test"],
				forward_scheme: "http",
				forward_host: "candidate.internal",
				forward_port: 80,
				meta: { wasm_filters: [] },
			}),
		});
		expect(response.status).toBe(400);
		const created = await state.db("proxy_host").whereNot("id", 1).first();
		expect(Boolean(created.is_deleted)).toBe(true);
		await expect(fs.stat(nginx.getConfigName("proxy_host", created.id))).rejects.toMatchObject({ code: "ENOENT" });
		expect(await fs.readFile(config, "utf8")).toBe("# previous active filters\n");
	});

	it("keeps a disabled host disabled when enable preflight fails", async () => {
		await state.db("proxy_host").where("id", 1).update({ enabled: false });
		await fs.rm(config);
		vi.spyOn(nginx, "configureHost").mockImplementation(async () => {
			await fs.writeFile(config, "candidate");
			throw new errs.ConfigurationError("Wasm execution failed");
		});
		const response = await fetch(`${origin}/api/nginx/proxy-hosts/1/enable`, { method: "POST" });
		expect(response.status).toBe(400);
		expect(Boolean((await state.db("proxy_host").first()).enabled)).toBe(false);
		await expect(fs.stat(config)).rejects.toMatchObject({ code: "ENOENT" });
	});
	it("restores the active host and database when disabling cannot reload", async () => {
		nginx.reload.mockRejectedValueOnce(new errs.ConfigurationError("reload failed"));
		const response = await fetch(`${origin}/api/nginx/proxy-hosts/1/disable`, { method: "POST" });
		expect(response.status).toBe(400);
		expect(Boolean((await state.db("proxy_host").first()).enabled)).toBe(true);
		expect(await fs.readFile(config, "utf8")).toBe("# previous active filters\n");
	});

	it("records baseline and accepted state while preserving server-trusted current metadata", async () => {
		vi.spyOn(nginx, "configureHost").mockImplementation(async () => {
			await fs.writeFile(config, "# accepted filters\n");
			return { nginx_online: true, nginx_err: null };
		});
		const response = await update({ forward_host: "new.internal" });
		expect(response.status).toBe(200);
		expect(JSON.parse((await state.db("proxy_host").first()).meta).wasm_filters).toEqual(oldMeta.wasm_filters);
		expect(await state.db("proxy_host_revision")).toHaveLength(2);
		expect(response.body.forward_host).toBe("new.internal");
	});
});
