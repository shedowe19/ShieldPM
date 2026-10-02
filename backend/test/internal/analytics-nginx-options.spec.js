import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, query: vi.fn(), audit: vi.fn(), cleanup: vi.fn(), reload: vi.fn() }));
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
vi.mock("../../internal/audit-log.js", () => ({ default: { add: state.audit } }));
vi.mock("../../internal/analytics.js", () => ({ default: { runRetention: state.cleanup } }));
vi.mock("../../internal/nginx.js", () => ({ default: { reload: state.reload } }));

import analytics from "../../internal/analytics-options.js";
import nginx from "../../internal/nginx-options.js";
import setting from "../../internal/setting.js";
import errs from "../../lib/error.js";

const access = { can: vi.fn() };
const cases = [
	[
		"analytics-options",
		analytics,
		{ detailed_retention_hours: 24, aggregation_retention_days: 35 },
		{ detailed_retention_hours: 48, aggregation_retention_days: 90 },
	],
	["nginx-options", nginx, { beautifier_enabled: true }, { beautifier_enabled: false }],
];

describe("database analytics and Nginx application options", () => {
	let directory;
	let config;
	beforeEach(async () => {
		vi.resetAllMocks();
		directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-analytics-nginx-options-"));
		config = {
			client: "better-sqlite3",
			connection: { filename: path.join(directory, "settings.sqlite") },
			useNullAsDefault: true,
		};
		state.db = knex(config);
		await state.db.schema.createTable("setting", (table) => {
			table.string("id").primary();
			table.string("value");
			table.text("meta");
		});
		await state
			.db("setting")
			.insert(cases.map(([id, , defaults]) => ({ id, value: "configured", meta: JSON.stringify(defaults) })));
	});
	afterEach(async () => {
		vi.unstubAllEnvs();
		await state.db.destroy();
		fs.rmSync(directory, { recursive: true, force: true });
	});
	it.each(cases)(
		"reads %s only from the database and fails closed for absent rows",
		async (id, service, defaults) => {
			vi.stubEnv("ANALYTICS_DETAILED_RETENTION_HOURS", "1");
			vi.stubEnv("ANALYTICS_AGGREGATION_RETENTION_DAYS", "1");
			vi.stubEnv("DISABLE_NGINX_BEAUTIFIER", "true");
			expect(await service.get(access)).toEqual(defaults);
			expect(access.can).toHaveBeenCalledWith("settings:get", id);
			await state.db("setting").where({ id }).delete();
			await expect(service.getPolicy()).rejects.toMatchObject({ name: "ConfigurationError" });
		},
	);
	it.each(cases)(
		"persists %s across reconnection without immediate cleanup or reload",
		async (id, service, _defaults, policy) => {
			expect(await service.update(access, policy)).toEqual(policy);
			expect(access.can).toHaveBeenCalledWith("settings:update", id);
			expect(state.audit).toHaveBeenCalledExactlyOnceWith(
				access,
				expect.objectContaining({
					meta: expect.objectContaining({ setting_id: id, value: "configured", ...policy }),
				}),
			);
			expect(state.cleanup).not.toHaveBeenCalled();
			expect(state.reload).not.toHaveBeenCalled();
			await state.db.destroy();
			state.db = knex(config);
			expect(await service.getPolicy()).toEqual(policy);
		},
	);
	it.each(cases)(
		"checks read and write permissions for %s before database operations",
		async (_id, service, defaults) => {
			access.can.mockRejectedValue(new errs.PermissionError());
			await expect(service.get(access)).rejects.toMatchObject({ status: 403 });
			await expect(service.update(access, defaults)).rejects.toMatchObject({ status: 403 });
			expect(state.query).not.toHaveBeenCalled();
			expect(state.audit).not.toHaveBeenCalled();
		},
	);
	it.each(cases)(
		"rejects generic updates of %s before database operations",
		async (id, _service, _defaults, meta) => {
			await expect(setting.update(access, { id, value: "configured", meta })).rejects.toMatchObject({
				status: 400,
			});
			expect(state.query).not.toHaveBeenCalled();
			expect(state.audit).not.toHaveBeenCalled();
		},
	);
	it.each([
		[analytics, null],
		[analytics, []],
		[analytics, {}],
		[analytics, { detailed_retention_hours: "24", aggregation_retention_days: 35 }],
		[analytics, { detailed_retention_hours: 0, aggregation_retention_days: 35 }],
		[analytics, { detailed_retention_hours: 24, aggregation_retention_days: -1 }],
		[analytics, { detailed_retention_hours: 1.5, aggregation_retention_days: 35 }],
		[analytics, { detailed_retention_hours: Number.MAX_SAFE_INTEGER + 1, aggregation_retention_days: 35 }],
		[analytics, { detailed_retention_hours: 24, aggregation_retention_days: Number.POSITIVE_INFINITY }],
		[analytics, { detailed_retention_hours: 24, aggregation_retention_days: 35, extra: true }],
		[nginx, null],
		[nginx, []],
		[nginx, {}],
		[nginx, { beautifier_enabled: "false" }],
		[nginx, { beautifier_enabled: false, extra: true }],
	])("rejects invalid option objects without a write", async (service, policy) => {
		await expect(service.update(access, policy)).rejects.toMatchObject({ status: 400 });
		expect(state.query).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
	});
	it.each(cases)("fails closed for corrupt saved %s options", async (id, service, defaults) => {
		for (const [value, meta] of [
			["inherit", defaults],
			["configured", null],
			["configured", { ...defaults, extra: true }],
		]) {
			await state
				.db("setting")
				.where({ id })
				.update({ value, meta: JSON.stringify(meta) });
			await expect(service.getPolicy()).rejects.toMatchObject({ name: "ConfigurationError" });
		}
	});
	it("preserves long retention and independent periods exactly", async () => {
		const policy = { detailed_retention_hours: Number.MAX_SAFE_INTEGER, aggregation_retention_days: 1 };
		expect(await analytics.update(access, policy)).toEqual(policy);
		expect(await analytics.getPolicy()).toEqual(policy);
	});
	it.each(cases)("does not report success for a missing %s row", async (id, service, defaults) => {
		await state.db("setting").where({ id }).delete();
		await expect(service.update(access, defaults)).rejects.toMatchObject({ status: 404 });
		expect(state.audit).not.toHaveBeenCalled();
	});
	it.each(cases)(
		"keeps %s unchanged on a failed write and allows the next save",
		async (_id, service, defaults, policy) => {
			await state.db.raw(
				"CREATE TRIGGER reject_options BEFORE UPDATE ON setting BEGIN SELECT RAISE(ABORT, 'options write failed'); END",
			);
			await expect(service.update(access, policy)).rejects.toThrow("options write failed");
			expect(await service.getPolicy()).toEqual(defaults);
			expect(state.audit).not.toHaveBeenCalled();
			await state.db.raw("DROP TRIGGER reject_options");
			expect(await service.update(access, policy)).toEqual(policy);
		},
	);
});
