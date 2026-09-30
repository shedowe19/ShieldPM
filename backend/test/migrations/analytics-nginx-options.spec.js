import knex from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate as migrationLogger } from "../../logger.js";
import * as settingsTable from "../../migrations/20190227065017_settings.js";
import * as analyticsNginxOptions from "../../migrations/20260930000300_add_analytics_nginx_options.js";
import { createPostgres } from "../helpers/postgres.js";

vi.mock("../../logger.js", () => ({ migrate: { info: vi.fn(), warn: vi.fn() } }));

const settingIds = ["analytics-options", "nginx-options"];
const decodeMeta = ({ meta }) => (typeof meta === "string" ? JSON.parse(meta) : meta);
const stubLegacyEnvironment = (values = {}) => {
	for (const key of [
		"ANALYTICS_DETAILED_RETENTION_HOURS",
		"ANALYTICS_AGGREGATION_RETENTION_DAYS",
		"DISABLE_NGINX_BEAUTIFIER",
	]) {
		vi.stubEnv(key, values[key]);
	}
};

describe.each(["sqlite", "postgres"])("analytics and Nginx options migration on %s", (engine) => {
	let embedded;
	let database;
	let unrelatedRows;

	beforeEach(async () => {
		embedded = engine === "postgres" ? await createPostgres() : null;
		database =
			embedded?.database ||
			knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
		await settingsTable.up(database);
		await database("setting").insert([
			{
				id: "default-site",
				name: "Default Site",
				description: "Existing page",
				value: "html",
				meta: JSON.stringify({ html: "<p>Keep this page</p>" }),
			},
			{
				id: "certificate-options",
				name: "Certificate Options",
				description: "Existing application options",
				value: "configured",
				meta: JSON.stringify({ key_type: "rsa", renewal_interval_hours: 6 }),
			},
		]);
		unrelatedRows = await database("setting").orderBy("id");
		stubLegacyEnvironment();
		vi.clearAllMocks();
	}, 30000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		if (embedded) await embedded.close();
		else await database?.destroy();
	});

	it("creates default retention and enables formatting when legacy options are absent or empty", async () => {
		for (const value of [undefined, ""]) {
			await database("setting").whereIn("id", settingIds).delete();
			stubLegacyEnvironment({
				ANALYTICS_DETAILED_RETENTION_HOURS: value,
				ANALYTICS_AGGREGATION_RETENTION_DAYS: value,
			});
			await analyticsNginxOptions.up(database);
			expect(decodeMeta(await database("setting").where({ id: "analytics-options" }).first())).toEqual({
				detailed_retention_hours: 24,
				aggregation_retention_days: 35,
			});
			expect(decodeMeta(await database("setting").where({ id: "nginx-options" }).first())).toEqual({
				beautifier_enabled: true,
			});
			for (const id of settingIds) {
				expect(await database("setting").where({ id }).first()).toMatchObject({ id, value: "configured" });
			}
		}
		expect(migrationLogger.warn).not.toHaveBeenCalled();
	});

	it("preserves positive legacy parseInt values without shortening long retention periods", async () => {
		for (const [hours, days, expectedHours, expectedDays] of [
			["720", "3650000", 720, 3650000],
			["9007199254740991", "9007199254740991", Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
			["876000hours", "36500days", 876000, 36500],
			["1.5", "2.5", 1, 2],
		]) {
			await database("setting").whereIn("id", settingIds).delete();
			stubLegacyEnvironment({
				ANALYTICS_DETAILED_RETENTION_HOURS: hours,
				ANALYTICS_AGGREGATION_RETENTION_DAYS: days,
			});
			await analyticsNginxOptions.up(database);
			expect(decodeMeta(await database("setting").where({ id: "analytics-options" }).first())).toEqual({
				detailed_retention_hours: expectedHours,
				aggregation_retention_days: expectedDays,
			});
		}
		expect(migrationLogger.warn).not.toHaveBeenCalled();
	});

	it("protects history with safe-integer sentinels for invalid explicitly configured retention", async () => {
		for (const [hours, days, expectedHours, expectedDays] of [
			["0", "35", Number.MAX_SAFE_INTEGER, 35],
			["24", "-1", 24, Number.MAX_SAFE_INTEGER],
			["INVALID_LEGACY_RETENTION_VALUE", "35", Number.MAX_SAFE_INTEGER, 35],
			["9007199254740992", "9007199254740992", Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
			[" ", "Infinity", Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
		]) {
			await database("setting").whereIn("id", settingIds).delete();
			stubLegacyEnvironment({
				ANALYTICS_DETAILED_RETENTION_HOURS: hours,
				ANALYTICS_AGGREGATION_RETENTION_DAYS: days,
			});
			vi.clearAllMocks();
			await analyticsNginxOptions.up(database);
			expect(decodeMeta(await database("setting").where({ id: "analytics-options" }).first())).toEqual({
				detailed_retention_hours: expectedHours,
				aggregation_retention_days: expectedDays,
			});
			if (expectedHours === Number.MAX_SAFE_INTEGER) {
				expect(migrationLogger.warn).toHaveBeenCalledWith(
					expect.stringContaining("ANALYTICS_DETAILED_RETENTION_HOURS"),
				);
			}
			if (expectedDays === Number.MAX_SAFE_INTEGER) {
				expect(migrationLogger.warn).toHaveBeenCalledWith(
					expect.stringContaining("ANALYTICS_AGGREGATION_RETENTION_DAYS"),
				);
			}
			const warningMessages = vi
				.mocked(migrationLogger.warn)
				.mock.calls.map(([message]) => message)
				.join(" ");
			expect(warningMessages).not.toContain("INVALID_LEGACY_RETENTION_VALUE");
			expect(warningMessages).not.toContain("9007199254740992");
		}
	});

	it("disables formatting only for the exact legacy true flag", async () => {
		for (const value of ["true", "false", "TRUE", "1", "", undefined]) {
			await database("setting").where({ id: "nginx-options" }).delete();
			stubLegacyEnvironment({ DISABLE_NGINX_BEAUTIFIER: value });
			await analyticsNginxOptions.up(database);
			expect(decodeMeta(await database("setting").where({ id: "nginx-options" }).first())).toEqual({
				beautifier_enabled: value !== "true",
			});
		}
	});

	it("preserves saved modes and retention after environment changes and deletes only its own rows on rollback", async () => {
		await analyticsNginxOptions.up(database);
		await database("setting")
			.where({ id: "analytics-options" })
			.update({ meta: JSON.stringify({ detailed_retention_hours: 876000, aggregation_retention_days: 36500 }) });
		await database("setting")
			.where({ id: "nginx-options" })
			.update({ meta: JSON.stringify({ beautifier_enabled: false }) });
		const savedRows = await database("setting").whereIn("id", settingIds).orderBy("id");
		stubLegacyEnvironment({
			ANALYTICS_DETAILED_RETENTION_HOURS: "INVALID_LEGACY_RETENTION_VALUE",
			ANALYTICS_AGGREGATION_RETENTION_DAYS: "0",
			DISABLE_NGINX_BEAUTIFIER: "false",
		});
		vi.clearAllMocks();
		await analyticsNginxOptions.up(database);
		await analyticsNginxOptions.up(database);
		expect(await database("setting").whereIn("id", settingIds).orderBy("id")).toEqual(savedRows);
		expect(migrationLogger.warn).not.toHaveBeenCalled();

		await analyticsNginxOptions.down(database);
		await analyticsNginxOptions.down(database);
		expect(await database("setting").orderBy("id")).toEqual(unrelatedRows);
		stubLegacyEnvironment();
		await analyticsNginxOptions.up(database);
		expect(decodeMeta(await database("setting").where({ id: "analytics-options" }).first())).toEqual({
			detailed_retention_hours: 24,
			aggregation_retention_days: 35,
		});
	});

	it("fills missing options while preserving an already imported row", async () => {
		for (const existingId of settingIds) {
			await database("setting").whereIn("id", settingIds).delete();
			await database("setting").insert({
				id: existingId,
				name: "Previously saved options",
				description: "Preserve this imported row",
				value: "configured",
				meta: JSON.stringify(
					existingId === "analytics-options"
						? { detailed_retention_hours: 438000, aggregation_retention_days: 18250 }
						: { beautifier_enabled: false },
				),
			});
			const existingRow = await database("setting").where({ id: existingId }).first();
			await analyticsNginxOptions.up(database);
			expect(await database("setting").where({ id: existingId }).first()).toEqual(existingRow);
			expect(await database("setting").whereIn("id", settingIds)).toHaveLength(2);
		}
	});
});
