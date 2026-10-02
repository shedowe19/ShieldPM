import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, query: vi.fn(), configure: vi.fn(), audit: vi.fn() }));
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
	return { default: { query: (...args) => state.query(...args) || Setting.query(state.db) } };
});
vi.mock("../../internal/ip_ranges.js", () => ({ default: { configure: state.configure } }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: state.audit } }));

import options from "../../internal/ip-ranges-options.js";
import errs from "../../lib/error.js";

const access = { can: vi.fn() };
const defaults = { enabled: false, refresh_interval_hours: 6 };

describe("database-controlled IP range refresh settings", () => {
	let directory;
	let configuration;
	beforeEach(async () => {
		vi.resetAllMocks();
		directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-ip-options-"));
		configuration = {
			client: "better-sqlite3",
			connection: { filename: path.join(directory, "settings.sqlite") },
			useNullAsDefault: true,
		};
		state.db = knex(configuration);
		await state.db.schema.createTable("setting", (table) => {
			table.string("id").primary();
			table.string("value");
			table.text("meta");
		});
		await state
			.db("setting")
			.insert({ id: "ip-ranges-options", value: "configured", meta: JSON.stringify(defaults) });
	});
	afterEach(async () => {
		vi.unstubAllEnvs();
		await state.db.destroy();
		fs.rmSync(directory, { recursive: true, force: true });
	});

	it("reads saved settings only after checking administrator settings access", async () => {
		expect(await options.get(access)).toEqual(defaults);
		expect(access.can).toHaveBeenCalledExactlyOnceWith("settings:get", "ip-ranges-options");
		expect(state.configure).not.toHaveBeenCalled();
	});

	it.each(["get", "update"])(
		"rejects denied %s permission before reading or applying settings",
		async (operation) => {
			access.can.mockRejectedValue(new errs.PermissionError());
			await expect(
				operation === "get" ? options.get(access) : options.update(access, defaults),
			).rejects.toMatchObject({
				status: 403,
			});
			expect(state.query).not.toHaveBeenCalled();
			expect(state.configure).not.toHaveBeenCalled();
			expect(state.audit).not.toHaveBeenCalled();
		},
	);

	it.each([
		["false", "99"],
		["false", "2"],
		["true", "invalid"],
	])("defaults missing settings without using SKIP_IP_RANGES=%s or IPRT=%s", async (skip, multiplier) => {
		vi.stubEnv("SKIP_IP_RANGES", skip);
		vi.stubEnv("IPRT", multiplier);
		await state.db("setting").delete();
		expect(await options.getPolicy()).toEqual(defaults);
		expect(state.configure).not.toHaveBeenCalled();
	});

	it.each([
		undefined,
		null,
		{},
		{ enabled: true },
		{ refresh_interval_hours: 6 },
		{ ...defaults, enabled: "false" },
		{ ...defaults, enabled: 1 },
		{ ...defaults, refresh_interval_hours: "6" },
		{ ...defaults, refresh_interval_hours: 0 },
		{ ...defaults, refresh_interval_hours: 5 },
		{ ...defaults, refresh_interval_hours: 7 },
		{ ...defaults, refresh_interval_hours: 6.5 },
		{ ...defaults, refresh_interval_hours: 600 },
		{ ...defaults, refresh_interval_hours: Number.POSITIVE_INFINITY },
		{ ...defaults, interval_timeout: 1 },
	])("rejects invalid or injected input %j before persistence or timer changes", async (payload) => {
		await expect(options.update(access, payload)).rejects.toMatchObject({ status: 400 });
		expect(state.query).not.toHaveBeenCalled();
		expect(state.configure).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
		expect(await options.getPolicy()).toEqual(defaults);
	});

	it.each([
		{ enabled: true, refresh_interval_hours: 6 },
		{ enabled: false, refresh_interval_hours: 24 },
		{ enabled: true, refresh_interval_hours: 594 },
	])("persists and applies %j across database reconnection regardless of environment", async (policy) => {
		vi.stubEnv("SKIP_IP_RANGES", policy.enabled ? "true" : "false");
		vi.stubEnv("IPRT", "invalid");
		expect(await options.update(access, policy)).toEqual(policy);
		expect(access.can).toHaveBeenCalledExactlyOnceWith("settings:update", "ip-ranges-options");
		expect(state.configure).toHaveBeenCalledExactlyOnceWith(policy);
		expect(state.audit).toHaveBeenCalledExactlyOnceWith(access, {
			action: "updated",
			object_type: "setting",
			object_id: 0,
			meta: { setting_id: "ip-ranges-options", name: "IP Range Options", value: policy },
		});
		await state.db.destroy();
		state.db = knex(configuration);
		expect(await options.getPolicy()).toEqual(policy);
		expect((await state.db("setting").first()).value).toBe("configured");
	});

	it.each([
		{ value: "inherit", meta: JSON.stringify(defaults) },
		{ value: "configured", meta: "{}" },
		{ value: "configured", meta: JSON.stringify({ ...defaults, refresh_interval_hours: 7 }) },
		{ value: "configured", meta: JSON.stringify({ ...defaults, enabled: "true" }) },
		{ value: "configured", meta: JSON.stringify({ ...defaults, injected: true }) },
	])("rejects corrupt saved policy %j rather than starting an unsafe timer", async (row) => {
		await state.db("setting").update(row);
		await expect(options.getPolicy()).rejects.toMatchObject({ name: "ConfigurationError", status: 400 });
		expect(state.configure).not.toHaveBeenCalled();
	});

	it("preserves the previous database settings and timer after a genuine database write failure", async () => {
		await state.db.raw(
			"CREATE TRIGGER reject_options BEFORE UPDATE ON setting BEGIN SELECT RAISE(ABORT, 'options write failed'); END",
		);
		await expect(options.update(access, { enabled: true, refresh_interval_hours: 24 })).rejects.toThrow(
			"options write failed",
		);
		expect(await options.getPolicy()).toEqual(defaults);
		expect(state.configure).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
	});

	it("does not apply or audit settings when the migration row is missing", async () => {
		await state.db("setting").delete();
		await expect(options.update(access, { enabled: true, refresh_interval_hours: 6 })).rejects.toMatchObject({
			status: 404,
		});
		expect(state.configure).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
	});

	it("serializes concurrent changes so the last persisted policy is also the live policy", async () => {
		let releaseFirst;
		state.configure.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					releaseFirst = resolve;
				}),
		);
		const firstPolicy = { enabled: true, refresh_interval_hours: 12 };
		const lastPolicy = { enabled: false, refresh_interval_hours: 24 };
		const first = options.update(access, firstPolicy);
		const last = options.update(access, lastPolicy);
		await vi.waitFor(() => expect(state.configure).toHaveBeenCalledTimes(1));
		expect(await options.getPolicy()).toEqual(firstPolicy);
		releaseFirst();
		expect(await Promise.all([first, last])).toEqual([firstPolicy, lastPolicy]);
		expect(await options.getPolicy()).toEqual(lastPolicy);
		expect(state.configure.mock.calls).toEqual([[firstPolicy], [lastPolicy]]);
	});
});
