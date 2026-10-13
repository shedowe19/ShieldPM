import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dayjs from "dayjs";
import { Model } from "objection";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPostgres } from "../helpers/postgres.js";

const state = vi.hoisted(() => ({ db: null, engine: "sqlite" }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => state.engine === "sqlite",
	isPostgres: () => state.engine === "postgres",
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test-token" }));
vi.mock("../../lib/firewall-geoip.js", async (importOriginal) => ({
	...(await importOriginal()),
	assertConfiguredFirewallLookups: vi.fn().mockResolvedValue(undefined),
}));

import maintenance from "../../internal/maintenance.js";
import nginx from "../../internal/nginx.js";
import { sanitizeProxyHost } from "../../lib/host-response.js";
import utils from "../../lib/utils.js";
import { up as addPending } from "../../migrations/20261013000001_add_maintenance_pending.js";
import ProxyHost from "../../models/proxy_host.js";

describe.each(["sqlite", "postgres"])("durable maintenance activation in %s", (engine) => {
	let directory;
	let embedded;
	const filename = (id = 1) => path.join(directory, `${id}.conf`);
	const insertHost = async (data = {}) => {
		await state.db("proxy_host").insert({ id: 1, forward_host: "upstream.example.test", forward_scheme: "http", forward_port: 8080, meta: "{}", maintenance_start: "2026-09-01T12:00:00Z", ...data });
		await state.db("host_domain").insert({ proxy_host_id: data.id || 1, domain_name: `host-${data.id || 1}.example.test` });
		await fs.promises.writeFile(filename(data.id || 1), `working ${data.id || 1}`);
	};
	const persisted = () => ProxyHost.query().findById(1);
	const reloadCalls = () => utils.execFile.mock.calls.filter((call) => call[1][0] === "-s");

	beforeAll(async () => {
		state.engine = engine;
		if (engine === "postgres") {
			embedded = await createPostgres();
			state.db = embedded.database;
			Model.knex(state.db);
		}
		await state.db.schema.createTable("proxy_host", (table) => {
			table.increments("id");
			for (const name of ["forward_host", "forward_scheme", "domain_names", "meta", "modified_on", "maintenance_start", "maintenance_end"]) table.text(name);
			for (const name of ["forward_port", "certificate_id", "access_list_id", "is_deleted", "maintenance_active"]) table.integer(name).defaultTo(0);
			table.integer("enabled").defaultTo(1);
		});
		await addPending(state.db);
		await state.db.schema.createTable("host_domain", (table) => {
			table.increments("id");
			table.integer("proxy_host_id");
			table.text("domain_name");
		});
		for (const name of ["certificate", "access_list"]) await state.db.schema.createTable(name, (table) => {
			table.increments("id");
			table.integer("is_deleted").defaultTo(0);
			table.text("meta");
			table.text("provider");
		});
		for (const name of ["access_list_auth", "access_list_client"]) await state.db.schema.createTable(name, (table) => {
			table.increments("id");
			table.integer("access_list_id");
			table.text("username");
		});
	});
	beforeEach(async () => {
		directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "shieldpm-maintenance-"));
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-09-01T12:00:00Z"));
		vi.stubEnv("DISABLE_NGINX_BEAUTIFIER", "true");
		vi.spyOn(nginx, "getConfigName").mockImplementation((_kind, id) => filename(id));
		vi.spyOn(utils, "execFile").mockResolvedValue("");
		maintenance.intervalProcessing = false;
		await state.db("host_domain").delete();
		await state.db("proxy_host").delete();
	});
	afterEach(async () => {
		for (const timers of maintenance.scheduledTimers.values()) for (const timer of timers) clearTimeout(timer);
		maintenance.scheduledTimers.clear();
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		vi.useRealTimers();
		await fs.promises.rm(directory, { recursive: true, force: true });
	});
	afterAll(async () => {
		if (embedded) await embedded.close();
		else await state.db.destroy();
	});

	it("activates at the exact scheduled instant and clears a one-shot only after reload", async () => {
		await insertHost();
		await maintenance.processMaintenance();
		expect(await persisted()).toMatchObject({ maintenance_active: true, maintenance_pending: false, maintenance_start: null });
		expect(await fs.promises.readFile(filename(), "utf8")).toContain("/maintenance.html =503");
		expect(reloadCalls()).toHaveLength(1);
		expect(sanitizeProxyHost(await persisted())).not.toHaveProperty("maintenance_pending");
	});
	it("keeps disabled hosts disabled while completing their schedule", async () => {
		await insertHost({ enabled: 0 });
		await maintenance.processMaintenance();
		expect(await persisted()).toMatchObject({ maintenance_active: true, maintenance_pending: false, maintenance_start: null });
		expect(await fs.promises.readFile(filename(), "utf8")).toBe("working 1");
		expect(utils.execFile).not.toHaveBeenCalled();
	});
	it("keeps end-only manual maintenance active until its scheduled end", async () => {
		await insertHost({ maintenance_start: null, maintenance_end: "2026-09-01T13:00:00Z", maintenance_active: 1 });
		await maintenance.processMaintenance();
		expect(await persisted()).toMatchObject({ maintenance_active: true, maintenance_pending: false });
		expect(utils.execFile).not.toHaveBeenCalled();
	});
	it.each(["render", "test", "reload"])("retries a failed %s without consuming its schedule", async (phase) => {
		await insertHost();
		if (phase === "render") vi.spyOn(nginx, "generateConfig").mockRejectedValueOnce(new Error("Temporary render failure"));
		else {
			let rejected = false;
			utils.execFile.mockImplementation(async (_command, args) => {
				if (!rejected && args[0] === (phase === "test" ? "-tq" : "-s")) {
					rejected = true;
					throw new Error("Temporary activation failure");
				}
				return "";
			});
		}
		await maintenance.processMaintenance();
		expect(await persisted()).toMatchObject({ maintenance_active: true, maintenance_pending: true, maintenance_start: "2026-09-01T12:00:00.000Z" });
		expect(await fs.promises.readFile(filename(), "utf8")).toBe("working 1");
		await maintenance.processMaintenance();
		expect(await persisted()).toMatchObject({ maintenance_active: true, maintenance_pending: false, maintenance_start: null });
		expect(await fs.promises.readFile(filename(), "utf8")).toContain("/maintenance.html =503");
	});
	it("recovers a persisted pending activation after startup without any remaining dates", async () => {
		await insertHost({ maintenance_active: 1, maintenance_pending: true, maintenance_start: null });
		await maintenance.processMaintenance();
		expect(await persisted()).toMatchObject({ maintenance_active: true, maintenance_pending: false });
		expect(await fs.promises.readFile(filename(), "utf8")).toContain("/maintenance.html =503");
	});
	it("retries a failed scheduled end and clears both dates only after activation", async () => {
		await insertHost({ maintenance_active: 1, maintenance_start: "2026-09-01T11:00:00Z", maintenance_end: "2026-09-01T12:00:00Z" });
		vi.spyOn(nginx, "reload").mockRejectedValueOnce(new Error("Temporary reload failure"));
		await maintenance.processMaintenance();
		expect(await persisted()).toMatchObject({ maintenance_active: false, maintenance_pending: true, maintenance_end: "2026-09-01T12:00:00.000Z" });
		await maintenance.processMaintenance();
		expect(await persisted()).toMatchObject({ maintenance_active: false, maintenance_pending: false, maintenance_start: null, maintenance_end: null });
		expect(await fs.promises.readFile(filename(), "utf8")).not.toContain("/maintenance.html =503");
	});
	it("restores every staged host after a later render failure and activates one retry batch", async () => {
		await insertHost();
		await insertHost({ id: 2 });
		const generate = nginx.generateConfig;
		let failed = false;
		vi.spyOn(nginx, "generateConfig").mockImplementation(async (kind, host) => {
			if (host.id === 2 && !failed) {
				failed = true;
				throw new Error("Second host render failed");
			}
			return generate(kind, host);
		});
		await maintenance.processMaintenance();
		for (const id of [1, 2]) expect(await fs.promises.readFile(filename(id), "utf8")).toBe(`working ${id}`);
		utils.execFile.mockClear();
		await maintenance.processMaintenance();
		for (const id of [1, 2]) {
			expect(await ProxyHost.query().findById(id)).toMatchObject({ maintenance_pending: false, maintenance_start: null });
			expect(await fs.promises.readFile(filename(id), "utf8")).toContain("/maintenance.html =503");
		}
		expect(reloadCalls()).toHaveLength(1);
	});
	it("preserves a newer schedule saved while a previous activation is reloading", async () => {
		await insertHost();
		let edited = false;
		utils.execFile.mockImplementation(async (_command, args) => {
			if (args[0] === "-s" && !edited) {
				edited = true;
				await ProxyHost.query().findById(1).patch({ maintenance_active: 0, maintenance_start: "2026-09-02T12:00:00Z" });
			}
			return "";
		});
		await maintenance.processMaintenance();
		expect(await persisted()).toMatchObject({ maintenance_active: false, maintenance_pending: true, maintenance_start: "2026-09-02T12:00:00.000Z" });
		await maintenance.processMaintenance();
		expect(await persisted()).toMatchObject({ maintenance_pending: false, maintenance_start: "2026-09-02T12:00:00.000Z" });
		expect(await fs.promises.readFile(filename(), "utf8")).not.toContain("/maintenance.html =503");
	});
	it("does not overflow Node's timer limit for distant future dates", () => {
		vi.useFakeTimers();
		maintenance.scheduleTimers(1, dayjs().add(40, "days"), dayjs().add(41, "days"));
		expect(vi.getTimerCount()).toBe(0);
	});
});
