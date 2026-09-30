import knex from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as settingsTable from "../../migrations/20190227065017_settings.js";
import * as applicationOptions from "../../migrations/20260930000200_add_application_options.js";
import { createPostgres } from "../helpers/postgres.js";

vi.mock("../../logger.js", () => ({ migrate: { info: vi.fn(), warn: vi.fn() } }));

const settingIds = ["certificate-options", "ip-ranges-options"];
const stubLegacyEnvironment = (values = {}) => {
	for (const key of ["ACME_KEY_TYPE", "CRT", "SKIP_IP_RANGES", "IPRT"]) {
		vi.stubEnv(key, values[key]);
	}
};
const decodeMeta = ({ meta }) => (typeof meta === "string" ? JSON.parse(meta) : meta);

describe.each(["sqlite", "postgres"])("application options migration on %s", (engine) => {
	let embedded;
	let database;
	let unrelatedSetting;

	beforeEach(async () => {
		embedded = engine === "postgres" ? await createPostgres() : null;
		database =
			embedded?.database ||
			knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
		await settingsTable.up(database);
		await database("setting").insert({
			id: "default-site",
			name: "Default Site",
			description: "Existing setting",
			value: "html",
			meta: JSON.stringify({ html: "<p>Keep this page</p>" }),
		});
		unrelatedSetting = await database("setting").where({ id: "default-site" }).first();
		stubLegacyEnvironment();
	}, 30000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		if (embedded) await embedded.close();
		else await database?.destroy();
	});

	it("creates safe defaults when legacy options are absent", async () => {
		await applicationOptions.up(database);
		const certificates = await database("setting").where({ id: "certificate-options" }).first();
		const ranges = await database("setting").where({ id: "ip-ranges-options" }).first();
		expect(certificates.value).toBe("configured");
		expect(decodeMeta(certificates)).toEqual({ key_type: "ecdsa", renewal_interval_hours: 12 });
		expect(ranges.value).toBe("configured");
		expect(decodeMeta(ranges)).toEqual({ enabled: false, refresh_interval_hours: 6 });
		expect(await database("setting").where({ id: "default-site" }).first()).toEqual(unrelatedSetting);
	});

	it("imports valid legacy values and clamps long certificate intervals", async () => {
		for (const [env, expectedCertificates, expectedRanges] of [
			[
				{ ACME_KEY_TYPE: "rsa", CRT: "4", SKIP_IP_RANGES: "false", IPRT: "2" },
				{ key_type: "rsa", renewal_interval_hours: 4 },
				{ enabled: true, refresh_interval_hours: 12 },
			],
			[
				{ ACME_KEY_TYPE: "ecdsa", CRT: "1", SKIP_IP_RANGES: "true", IPRT: "99" },
				{ key_type: "ecdsa", renewal_interval_hours: 1 },
				{ enabled: false, refresh_interval_hours: 594 },
			],
			[
				{ ACME_KEY_TYPE: "rsa", CRT: "596", SKIP_IP_RANGES: "false", IPRT: "1" },
				{ key_type: "rsa", renewal_interval_hours: 12 },
				{ enabled: true, refresh_interval_hours: 6 },
			],
		]) {
			await database("setting").whereIn("id", settingIds).delete();
			stubLegacyEnvironment(env);
			await applicationOptions.up(database);
			expect(decodeMeta(await database("setting").where({ id: "certificate-options" }).first())).toEqual(
				expectedCertificates,
			);
			expect(decodeMeta(await database("setting").where({ id: "ip-ranges-options" }).first())).toEqual(
				expectedRanges,
			);
		}
	});

	it("uses safe defaults for invalid legacy key types, intervals and enable flags", async () => {
		for (const env of [
			{ ACME_KEY_TYPE: "ed25519", CRT: "0", SKIP_IP_RANGES: "FALSE", IPRT: "0" },
			{ ACME_KEY_TYPE: "RSA", CRT: "2.5", SKIP_IP_RANGES: "1", IPRT: "1.5" },
			{ ACME_KEY_TYPE: "", CRT: "597", SKIP_IP_RANGES: "", IPRT: "100" },
			{ CRT: "invalid", IPRT: "invalid" },
			{ CRT: "-1", IPRT: "-1" },
			{ CRT: "Infinity", IPRT: "Infinity" },
		]) {
			await database("setting").whereIn("id", settingIds).delete();
			stubLegacyEnvironment(env);
			await applicationOptions.up(database);
			expect(decodeMeta(await database("setting").where({ id: "certificate-options" }).first())).toEqual({
				key_type: "ecdsa",
				renewal_interval_hours: 12,
			});
			expect(decodeMeta(await database("setting").where({ id: "ip-ranges-options" }).first())).toEqual({
				enabled: false,
				refresh_interval_hours: 6,
			});
		}
	});

	it("keeps saved values after environment changes and rolls back only its own settings", async () => {
		await applicationOptions.up(database);
		await database("setting")
			.where({ id: "certificate-options" })
			.update({ meta: JSON.stringify({ key_type: "rsa", renewal_interval_hours: 3 }) });
		await database("setting")
			.where({ id: "ip-ranges-options" })
			.update({ meta: JSON.stringify({ enabled: true, refresh_interval_hours: 24 }) });
		const savedRows = await database("setting").whereIn("id", settingIds).orderBy("id");
		stubLegacyEnvironment({ ACME_KEY_TYPE: "ecdsa", CRT: "12", SKIP_IP_RANGES: "true", IPRT: "99" });
		await applicationOptions.up(database);
		await applicationOptions.up(database);
		expect(await database("setting").whereIn("id", settingIds).orderBy("id")).toEqual(savedRows);

		await applicationOptions.down(database);
		await applicationOptions.down(database);
		expect(await database("setting").whereIn("id", settingIds)).toHaveLength(0);
		expect(await database("setting").where({ id: "default-site" }).first()).toEqual(unrelatedSetting);
		await applicationOptions.up(database);
		expect(decodeMeta(await database("setting").where({ id: "ip-ranges-options" }).first())).toEqual({
			enabled: false,
			refresh_interval_hours: 594,
		});
	});

	it("fills a partially imported installation while preserving the existing row", async () => {
		for (const existingId of settingIds) {
			await database("setting").whereIn("id", settingIds).delete();
			await database("setting").insert({
				id: existingId,
				name: "Previously saved options",
				description: "Do not replace this row",
				value: "configured",
				meta: JSON.stringify(
					existingId === "certificate-options"
						? { key_type: "rsa", renewal_interval_hours: 2 }
						: { enabled: true, refresh_interval_hours: 48 },
				),
			});
			const existingRow = await database("setting").where({ id: existingId }).first();
			await applicationOptions.up(database);
			expect(await database("setting").where({ id: existingId }).first()).toEqual(existingRow);
			expect(await database("setting").whereIn("id", settingIds)).toHaveLength(2);
		}
	});
});
