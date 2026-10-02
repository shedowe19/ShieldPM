import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, query: vi.fn(), audit: vi.fn(), reschedule: vi.fn() }));
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
vi.mock("../../internal/certificate.js", () => ({ default: { rescheduleTimer: state.reschedule } }));

import options from "../../internal/certificate-options.js";
import errs from "../../lib/error.js";

const access = { can: vi.fn() };
const defaultPolicy = { key_type: "ecdsa", renewal_interval_hours: 12 };

describe("database certificate options", () => {
	let directory;
	let databaseConfig;
	beforeEach(async () => {
		vi.resetAllMocks();
		directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-certificate-options-"));
		databaseConfig = {
			client: "better-sqlite3",
			connection: { filename: path.join(directory, "settings.sqlite") },
			useNullAsDefault: true,
		};
		state.db = knex(databaseConfig);
		await state.db.schema.createTable("setting", (table) => {
			table.string("id").primary();
			table.string("value");
			table.text("meta");
		});
		await state.db("setting").insert({
			id: "certificate-options",
			value: "configured",
			meta: JSON.stringify(defaultPolicy),
		});
	});
	afterEach(async () => {
		vi.unstubAllEnvs();
		await state.db.destroy();
		fs.rmSync(directory, { recursive: true, force: true });
	});

	it("uses database options even when removed environment controls disagree", async () => {
		vi.stubEnv("CRT", "1");
		vi.stubEnv("ACME_KEY_TYPE", "rsa");
		expect(await options.get(access)).toEqual(defaultPolicy);
		expect(access.can).toHaveBeenCalledWith("settings:get", "certificate-options");
		expect(state.reschedule).not.toHaveBeenCalled();
	});
	it("uses safe application defaults when the migration row is absent", async () => {
		await state.db("setting").delete();
		vi.stubEnv("CRT", "1");
		vi.stubEnv("ACME_KEY_TYPE", "rsa");
		expect(await options.getPolicy()).toEqual(defaultPolicy);
	});
	it.each(["get", "update"])("checks %s access before database operations", async (operation) => {
		access.can.mockRejectedValue(new errs.PermissionError());
		await expect(
			operation === "get" ? options.get(access) : options.update(access, defaultPolicy),
		).rejects.toMatchObject({ status: 403 });
		expect(state.query).not.toHaveBeenCalled();
		expect(state.reschedule).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
	});
	it.each([
		{ key_type: "ed25519", renewal_interval_hours: 3 },
		{ key_type: "rsa", renewal_interval_hours: 0 },
		{ key_type: "rsa", renewal_interval_hours: 13 },
		{ key_type: "rsa", renewal_interval_hours: 1.5 },
		{ key_type: "rsa", renewal_interval_hours: "3" },
		{ key_type: "rsa", renewal_interval_hours: 3, unexpected: true },
		null,
	])("rejects invalid updates %j without saving or replacing the timer", async (policy) => {
		await expect(options.update(access, policy)).rejects.toMatchObject({ status: 400 });
		expect(state.query).not.toHaveBeenCalled();
		expect(state.reschedule).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
		expect(await options.getPolicy()).toEqual(defaultPolicy);
	});
	it.each([
		["configured", { key_type: "rsa", renewal_interval_hours: 99 }],
		["configured", { ...defaultPolicy, extra: true }],
		["inherit", defaultPolicy],
		["configured", null],
	])("rejects corrupt saved options %s %j", async (value, meta) => {
		await state.db("setting").update({ value, meta: JSON.stringify(meta) });
		await expect(options.getPolicy()).rejects.toMatchObject({ name: "ConfigurationError" });
	});
	it("persists selected options across reconnection and applies the timer immediately", async () => {
		const policy = { key_type: "rsa", renewal_interval_hours: 2 };
		expect(await options.update(access, policy)).toEqual(policy);
		expect(access.can).toHaveBeenCalledWith("settings:update", "certificate-options");
		expect(state.reschedule).toHaveBeenCalledExactlyOnceWith(2);
		expect(state.audit).toHaveBeenCalledExactlyOnceWith(access, {
			action: "updated",
			object_type: "setting",
			object_id: 0,
			meta: { setting_id: "certificate-options", name: "Certificate Options", value: "configured", ...policy },
		});
		await state.db.destroy();
		state.db = knex(databaseConfig);
		expect(await options.getPolicy()).toEqual(policy);
	});
	it("leaves the timer and saved policy unchanged when a database write fails", async () => {
		await state.db.raw(
			"CREATE TRIGGER reject_options BEFORE UPDATE ON setting BEGIN SELECT RAISE(ABORT, 'options write failed'); END",
		);
		await expect(options.update(access, { key_type: "rsa", renewal_interval_hours: 2 })).rejects.toThrow(
			"options write failed",
		);
		expect(await options.getPolicy()).toEqual(defaultPolicy);
		expect(state.reschedule).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
	});
	it("does not report success or replace the timer when the migration row is missing", async () => {
		await state.db("setting").delete();
		await expect(options.update(access, defaultPolicy)).rejects.toMatchObject({ status: 404 });
		expect(state.reschedule).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
	});
	it("serializes saves until the first timer is applied, so the last saved options match the timer", async () => {
		const firstEntered = Promise.withResolvers();
		const releaseFirst = Promise.withResolvers();
		state.audit.mockImplementationOnce(async () => {
			firstEntered.resolve();
			await releaseFirst.promise;
		});
		const first = options.update(access, { key_type: "rsa", renewal_interval_hours: 2 });
		await firstEntered.promise;
		const second = options.update(access, { key_type: "ecdsa", renewal_interval_hours: 6 });
		await Promise.resolve();
		expect(await options.getPolicy()).toEqual({ key_type: "rsa", renewal_interval_hours: 2 });
		expect(state.reschedule.mock.calls).toEqual([[2]]);
		releaseFirst.resolve();
		await Promise.all([first, second]);
		expect(await options.getPolicy()).toEqual({ key_type: "ecdsa", renewal_interval_hours: 6 });
		expect(state.reschedule.mock.calls).toEqual([[2], [6]]);
	});
});
