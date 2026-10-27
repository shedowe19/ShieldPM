import { randomUUID } from "node:crypto";
import knex from "knex";
import { Model } from "objection";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ database: null }));
vi.mock("../../db.js", async () => {
	const { default: createKnex } = await import("knex");
	state.database = createKnex({ client: "mysql2" });
	return { default: () => state.database };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => false,
	isPostgres: () => false,
	getEncryptionKey: () => "0".repeat(64),
}));

import Certificate from "../../models/certificate.js";
import ProxyHost from "../../models/proxy_host.js";

const initialDatabase = state.database;
const shouldRunMariaDb = process.env.SHIELDPM_TEST_MARIADB === "1";
const connection = {
	host: process.env.SHIELDPM_TEST_MARIADB_HOST || "127.0.0.1",
	password: process.env.SHIELDPM_TEST_MARIADB_PASSWORD || "",
	port: Number(process.env.SHIELDPM_TEST_MARIADB_PORT || 3306),
	user: process.env.SHIELDPM_TEST_MARIADB_USER || "root",
	dateStrings: true,
	timezone: "Z",
};
const databaseName = `shieldpm_certificate_${randomUUID().replaceAll("-", "")}`;
const baseCertificate = (values = {}) => ({
	owner_user_id: 1,
	provider: "other",
	nice_name: "Datetime regression",
	...values,
});

afterAll(() => initialDatabase.destroy());
afterEach(() => vi.unstubAllEnvs());

(shouldRunMariaDb ? describe : describe.skip)("strict MariaDB certificate DATETIME persistence", () => {
	let admin;
	beforeAll(async () => {
		admin = knex({ client: "mysql2", connection });
		await admin.raw("CREATE DATABASE ??", [databaseName]);
		state.database = knex({
			client: "mysql2",
			connection: { ...connection, database: databaseName },
			pool: {
				min: 0,
				max: 2,
				afterCreate: (databaseConnection, callback) => {
					databaseConnection.query(
						"SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE', time_zone = '+09:00'",
						(error) => callback(error, databaseConnection),
					);
				},
			},
		});
		Model.knex(state.database);
		await state.database.schema.createTable("certificate", (table) => {
			table.increments("id").primary();
			table.integer("owner_user_id").notNullable();
			table.string("provider").notNullable();
			table.string("nice_name").notNullable();
			table.integer("is_deleted").notNullable().defaultTo(0);
			table.json("domain_names").notNullable();
			table.json("meta").notNullable();
			for (const field of ["expires_on", "created_on", "modified_on"]) table.dateTime(field).notNullable();
		});
		await state.database.schema.createTable("proxy_host", (table) => {
			table.increments("id").primary();
			table.integer("certificate_id");
			table.json("domain_names");
			table.json("meta");
			table.dateTime("modified_on");
		});
	});
	beforeEach(async () => {
		await state.database("proxy_host").delete();
		await state.database("certificate").delete();
	});
	afterAll(async () => {
		await state.database?.destroy();
		if (admin) {
			try {
				await admin.raw("DROP DATABASE IF EXISTS ??", [databaseName]);
			} finally {
				await admin.destroy();
			}
		}
	});

	it("reproduces the logged driver error and accepts the same values through the model", async () => {
		const row = await Certificate.query().insertAndFetch(baseCertificate({ id: 29 }));
		const update = {
			expires_on: "2026-12-17T23:59:59.000Z",
			created_on: "2026-05-11T07:26:50.000Z",
		};
		await expect(state.database("certificate").where("id", row.id).update(update)).rejects.toMatchObject({
			code: "ER_TRUNCATED_WRONG_VALUE",
			errno: 1292,
		});
		const updated = await Certificate.query().patchAndFetchById(row.id, update);
		expect(updated).toMatchObject({ expires_on: "2026-12-17 23:59:59", created_on: "2026-05-11 07:26:50" });
		expect(updated.modified_on).toMatch(/^\d{4}-\d{2}-\d{2} /);
	});

	it("applies offsets before DATETIME precision loss during inserts and transactional patches", async () => {
		const inserted = await Certificate.query().insertAndFetch(
			baseCertificate({ expires_on: "2026-12-18T01:59:59.999+02:00" }),
		);
		expect(inserted.expires_on).toBe("2026-12-17 23:59:59");
		await state.database.transaction(async (transaction) => {
			await Certificate.query(transaction)
				.findById(inserted.id)
				.patch({ expires_on: "2026-01-01T00:01:02+02:00" });
		});
		expect((await Certificate.query().findById(inserted.id)).expires_on).toBe("2025-12-31 22:01:02");
	});

	it("normalizes graph updates and preserves already formatted dates on later metadata patches", async () => {
		const inserted = await Certificate.query().insertAndFetch(baseCertificate());
		await Certificate.query().upsertGraph({ id: inserted.id, expires_on: "2026-12-17T21:59:59.123456-02:00" });
		const accepted = await Certificate.query().findById(inserted.id);
		expect(accepted.expires_on).toBe("2026-12-17 23:59:59");
		await Certificate.query().patchAndFetchById(inserted.id, { nice_name: "Renamed" });
		expect(await Certificate.query().findById(inserted.id)).toMatchObject({
			expires_on: accepted.expires_on,
			created_on: accepted.created_on,
			nice_name: "Renamed",
		});
	});

	it("rejects invalid calendar dates before they change the accepted certificate row", async () => {
		const inserted = await Certificate.query().insertAndFetch(
			baseCertificate({ expires_on: "2026-12-17 23:59:59" }),
		);
		await expect(
			Certificate.query().patchAndFetchById(inserted.id, { expires_on: "2026-02-30T00:00:00Z" }),
		).rejects.toThrow("Invalid certificate expires_on");
		expect((await Certificate.query().findById(inserted.id)).expires_on).toBe(inserted.expires_on);
	});

	it("accepts ISO certificate fields in the proxy-host graph update used by the service", async () => {
		const certificate = await Certificate.query().insertAndFetch(baseCertificate({ id: 29 }));
		await state.database("proxy_host").insert({ id: 1, certificate_id: certificate.id, meta: "{}" });
		await ProxyHost.query().upsertGraphAndFetch({
			id: 1,
			certificate: {
				id: certificate.id,
				expires_on: "2026-12-17T23:59:59.000Z",
				created_on: "2026-05-11T07:26:50.000Z",
			},
		});
		expect(await Certificate.query().findById(certificate.id)).toMatchObject({
			expires_on: "2026-12-17 23:59:59",
			created_on: "2026-05-11 07:26:50",
		});
	});

	it.each([
		["+02:00", "2026-12-17T23:59:59.000Z"],
		["-03:30", "2026-12-18T05:29:59.000Z"],
		["local", "2026-12-18T00:59:59.000Z"],
	])("preserves existing DATETIME instants with mysql2 timezone=%s", async (timezone, expectedExpiry) => {
		vi.stubEnv("TZ", "Europe/Berlin");
		const localDatabase = knex({
			client: "mysql2",
			connection: { ...connection, database: databaseName, dateStrings: false, timezone },
		});
		try {
			await state.database("certificate").insert({
				...baseCertificate({ id: 29 }),
				expires_on: "2026-12-18 01:59:59",
				created_on: "2026-05-11 09:26:50",
				modified_on: "2026-05-11 09:26:50",
				domain_names: "[]",
				meta: "{}",
			});
			Model.knex(localDatabase);
			const original = await Certificate.query().findById(29);
			const payload = JSON.parse(JSON.stringify(original));
			expect(payload.expires_on).toBe(expectedExpiry);
			const saved = await Certificate.query().patchAndFetchById(29, payload);
			expect(saved.expires_on.getTime()).toBe(original.expires_on.getTime());
			expect(saved.created_on.getTime()).toBe(original.created_on.getTime());
		} finally {
			Model.knex(state.database);
			await localDatabase.destroy();
		}
	});
});
