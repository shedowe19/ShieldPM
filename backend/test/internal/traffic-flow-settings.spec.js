import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	db: null,
	directory: null,
	available: true,
	failure: null,
	hosts: [],
	queue: Promise.resolve(),
	renders: [],
	reloads: 0,
}));
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
			transaction: async (callback) =>
				state.db.transaction(async (trx) => {
					await callback(trx);
					if (state.failure === "commit") {
						state.failure = null;
						throw new Error("commit failed");
					}
				}),
		},
	};
});
vi.mock("../../models/proxy_host.js", () => ({
	default: { query: () => ({ where: () => ({ select: async () => state.hosts }) }) },
}));
vi.mock("../../lib/traffic-flow-capability.js", () => ({ detectNativeFlow: async () => state.available }));
vi.mock("../../internal/traffic-flow.js", () => ({ default: { stop: vi.fn(), start: vi.fn() } }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/nginx.js", async () => {
	const { flowSettings, flowNativeAvailable } = await import("../../lib/traffic-flow-settings.js");
	const filename = (_type, id) => path.join(state.directory, `${id}.conf`);
	return {
		default: {
			withConfigurationLock: (callback) => {
				const result = state.queue.then(callback);
				state.queue = result.catch(() => {});
				return result;
			},
			getConfigName: filename,
			getCurrentHost: async (_model, _type, id) => ({ id, enabled: true }),
			backupConfig: async (type, host) => {
				if (fs.existsSync(filename(type, host.id)))
					fs.copyFileSync(filename(type, host.id), `${filename(type, host.id)}.bak`);
			},
			generateConfig: async (type, host) => {
				state.renders.push(host.id);
				fs.writeFileSync(
					filename(type, host.id),
					JSON.stringify({ policy: flowSettings(), available: flowNativeAvailable() }),
				);
				if (state.failure === "generate") {
					state.failure = null;
					throw new Error("generate");
				}
			},
			test: async () => {
				if (state.failure === "test") {
					state.failure = null;
					throw new Error("test");
				}
			},
			reload: async () => {
				state.reloads++;
				if (state.failure === "reload") {
					state.failure = null;
					throw new Error("reload");
				}
			},
			deleteFile: async (name) => fs.rmSync(name, { force: true }),
			restoreConfig: async (type, host) => {
				const name = filename(type, host.id);
				if (fs.existsSync(`${name}.bak`)) fs.renameSync(`${name}.bak`, name);
			},
			deleteBackupConfig: async (type, host) => fs.rmSync(`${filename(type, host.id)}.bak`, { force: true }),
		},
	};
});

import settings from "../../internal/setting.js";
import collector from "../../internal/traffic-flow.js";
import service, { validateFlowSettings } from "../../internal/traffic-flow-settings.js";
import {
	FLOW_DEFAULTS,
	flowRuntime,
	flowSettings,
	importedFlowSettings,
	setFlowSettings,
} from "../../lib/traffic-flow-settings.js";
import { up } from "../../migrations/20261106010000_traffic_flow_settings.js";

beforeEach(async () => {
	state.directory = fs.mkdtempSync(path.join(os.tmpdir(), "flow-settings-"));
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	await state.db.schema.createTable("setting", (table) => {
		table.string("id").primary();
		table.string("name");
		table.string("description");
		table.string("value");
		table.json("meta");
	});
	state.available = true;
	state.failure = null;
	state.hosts = [{ id: 1 }];
	state.renders = [];
	state.reloads = 0;
	state.queue = Promise.resolve();
	fs.writeFileSync(path.join(state.directory, "1.conf"), "previous bytes");
	setFlowSettings(FLOW_DEFAULTS, false);
	vi.clearAllMocks();
});
afterEach(async () => {
	await state.db.destroy();
	fs.rmSync(state.directory, { recursive: true, force: true });
	vi.unstubAllEnvs();
	setFlowSettings(FLOW_DEFAULTS, false);
});
const seed = async () => {
	await up(state.db);
	await service.initialize();
};
const stored = async () => JSON.parse((await state.db("setting").where({ id: "traffic-flow" }).first()).meta);

describe("persisted Traffic Flow settings", () => {
	it.each(["runtime.js", "index-dev.js"])("initializes persistent policy before collection in %s", (entry) => {
		const source = fs.readFileSync(new URL(`../../${entry}`, import.meta.url), "utf8");
		const operations = [
			"await migrateUp();",
			"await flowSettings.initialize();",
			"await analyticsService.init();",
			"await setup();",
			"await flowSettings.reconcileStartup();",
		];
		const positions = operations.map((operation) => source.indexOf(operation));
		expect(positions.every((position) => position >= 0)).toBe(true);
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
	});

	it.each([
		[undefined, true],
		["true", true],
		["false", false],
		["0", false],
		["FALSE", false],
		["", false],
	])("imports legacy boolean %s with its original meaning", (value, expected) => {
		expect(importedFlowSettings({ TRAFFIC_FLOW_ENABLED: value, TRAFFIC_FLOW_LIVE_ENABLED: value })).toEqual({
			enabled: expected,
			live_enabled: expected,
			client_mode: "prefix",
		});
	});

	it("defaults existing and new installations to enabled live flow with prefix privacy", async () => {
		await seed();
		expect(await stored()).toEqual(FLOW_DEFAULTS);
		expect(flowRuntime().live_effective).toBe(true);
	});
	it("imports explicit legacy controls once; persisted UI policy always wins", async () => {
		vi.stubEnv("TRAFFIC_FLOW_ENABLED", "false");
		vi.stubEnv("TRAFFIC_FLOW_CLIENT_MODE", "address");
		await seed();
		expect(flowSettings()).toMatchObject({ enabled: false, client_mode: "address" });
		await service.update({ meta: FLOW_DEFAULTS });
		await up(state.db);
		await service.initialize();
		expect(flowSettings()).toEqual(FLOW_DEFAULTS);
	});
	it("retains desired live on without rendering an unsupported native directive", async () => {
		state.available = false;
		await seed();
		await service.reconcileStartup();
		expect(flowSettings().live_enabled).toBe(true);
		expect(flowRuntime()).toMatchObject({ live_effective: false, reason: "native_module_unavailable" });
		expect(JSON.parse(fs.readFileSync(path.join(state.directory, "1.conf"))).available).toBe(false);
	});
	it("reconciles unchanged existing hosts at startup without regenerating isolated failures", async () => {
		await seed();
		state.hosts.push({ id: 2 });
		await service.reconcileStartup();
		expect(state.renders).toEqual([1]);
	});
	it("rebuilds all hosts, including beyond the display limit, on save", async () => {
		await seed();
		state.hosts = Array.from({ length: 123 }, (_, i) => ({ id: i + 1 }));
		for (const host of state.hosts)
			fs.writeFileSync(path.join(state.directory, `${host.id}.conf`), "previous bytes");
		await service.update({ meta: { ...FLOW_DEFAULTS, enabled: false } });
		expect(state.renders).toHaveLength(123);
		expect(collector.stop).toHaveBeenCalledOnce();
		expect(flowSettings().enabled).toBe(false);
	});
	for (const failure of ["generate", "test", "reload", "commit"])
		it(`restores files, database and runtime on ${failure} failure`, async () => {
			await seed();
			state.failure = failure;
			await expect(service.update({ meta: { ...FLOW_DEFAULTS, enabled: false } })).rejects.toThrow("restored");
			expect(await stored()).toEqual(FLOW_DEFAULTS);
			expect(flowSettings()).toEqual(FLOW_DEFAULTS);
			expect(fs.readFileSync(path.join(state.directory, "1.conf"), "utf8")).toBe("previous bytes");
			expect(collector.stop).not.toHaveBeenCalled();
		});
	it("preserves isolated .err files on save and rollback", async () => {
		await seed();
		state.hosts.push({ id: 2 });
		fs.writeFileSync(path.join(state.directory, "2.conf.err"), "diagnostic");
		state.failure = "test";
		await expect(service.update({ meta: FLOW_DEFAULTS })).rejects.toThrow();
		expect(fs.readFileSync(path.join(state.directory, "2.conf.err"), "utf8")).toBe("diagnostic");
		expect(state.renders).toEqual([1]);
	});
	it("keeps startup available after verified rollback and reports ineffective live configuration", async () => {
		await seed();
		state.failure = "test";
		await service.reconcileStartup();
		expect(flowRuntime()).toMatchObject({ live_effective: false, reason: "configuration_failed" });
		expect(fs.readFileSync(path.join(state.directory, "1.conf"), "utf8")).toBe("previous bytes");
	});
	it("clears observations on privacy changes and accepts explicit hidden mode", async () => {
		await seed();
		await service.update({ meta: { ...FLOW_DEFAULTS, client_mode: "hidden" } });
		expect(collector.stop).toHaveBeenCalledOnce();
		expect(flowSettings().client_mode).toBe("hidden");
	});
	it("serializes concurrent saves and keeps database, rendered files and runtime aligned", async () => {
		await seed();
		await Promise.all([
			service.update({ meta: { ...FLOW_DEFAULTS, client_mode: "address" } }),
			service.update({ meta: { ...FLOW_DEFAULTS, client_mode: "hidden" } }),
		]);
		expect((await stored()).client_mode).toBe("hidden");
		expect(flowSettings().client_mode).toBe("hidden");
		expect(JSON.parse(fs.readFileSync(path.join(state.directory, "1.conf"))).policy.client_mode).toBe("hidden");
	});

	it("requires admin settings permission before modifying policy", async () => {
		await seed();
		const can = vi.fn().mockRejectedValue(new Error("forbidden"));
		await expect(settings.update({ can }, { id: "traffic-flow", meta: FLOW_DEFAULTS })).rejects.toThrow(
			"forbidden",
		);
		expect(can).toHaveBeenCalledWith("settings:update", "traffic-flow");
		expect(state.renders).toEqual([]);
	});
	it("rejects missing fields, unknown privacy modes and extra metadata", () => {
		for (const meta of [
			{},
			{ ...FLOW_DEFAULTS, client_mode: "device" },
			{ ...FLOW_DEFAULTS, extra: true },
			{ ...FLOW_DEFAULTS, enabled: 1 },
		])
			expect(() => validateFlowSettings(meta)).toThrow();
	});
});
