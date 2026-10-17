import knex from "knex";
import { Model } from "objection";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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

const databases = [];
const asDatabaseJson = (values) => Certificate.fromJson(values).$toDatabaseJson(Certificate.query());

afterAll(async () => {
	for (const database of [state.database, ...databases]) await database.destroy();
});
beforeEach(() => Model.knex(state.database));

describe("certificate MySQL DATETIME writes", () => {
	it("serializes the exact certificate update from the production log without changing the public JSON", () => {
		const payload = {
			expires_on: "2026-12-17T23:59:59.000Z",
			created_on: "2026-05-11T07:26:50.000Z",
		};
		const certificate = Certificate.fromJson(payload);
		expect(certificate.$toDatabaseJson(Certificate.query())).toMatchObject({
			expires_on: new Date("2026-12-17T23:59:59.000Z"),
			created_on: new Date("2026-05-11T07:26:50.000Z"),
		});
		expect(certificate.toJSON()).toMatchObject(payload);
	});

	it.each([
		["2026-12-18T01:59:59.999+02:00", "2026-12-17 23:59:59"],
		["2026-12-17T21:59:59.123456-02:00", "2026-12-17 23:59:59"],
		["2026-01-01T00:01:02+02:00", "2025-12-31 22:01:02"],
		["2024-02-29T23:59:59Z", "2024-02-29 23:59:59"],
		["2026-12-17t23:59:59z", "2026-12-17 23:59:59"],
	])("preserves the UTC instant of %s at DATETIME second precision", (input, expected) => {
		expect(asDatabaseJson({ expires_on: input }).expires_on.toISOString()).toBe(
			`${expected.replace(" ", "T")}.000Z`,
		);
	});

	it("normalizes Date objects and modified timestamps at the same database boundary", () => {
		expect(
			asDatabaseJson({
				expires_on: new Date("2026-12-18T01:59:59.999+02:00"),
				modified_on: "2026-05-11T09:26:50.000+02:00",
			}),
		).toMatchObject({
			expires_on: new Date("2026-12-17T23:59:59.000Z"),
			modified_on: new Date("2026-05-11T07:26:50.000Z"),
		});
	});

	it.each(["2026-12-17 23:59:59", "2026-12-17 23:59:59.123456"])(
		"preserves an already formatted SQL timestamp %s",
		(value) => expect(asDatabaseJson({ expires_on: value }).expires_on).toBe(value),
	);

	it("retains database clock expressions and insert defaults", () => {
		const certificate = Certificate.fromJson({ provider: "other" });
		certificate.$beforeInsert();
		const data = certificate.$toDatabaseJson(Certificate.query());
		for (const field of ["created_on", "modified_on", "expires_on"]) {
			expect(data[field].toSQL().sql).toBe("NOW()");
		}
		expect(data.domain_names).toBe("[]");
		expect(data.meta).toBe("{}");
	});

	it("does not add omitted timestamps to partial patches", () => {
		const data = asDatabaseJson({ nice_name: "Renamed" });
		for (const field of ["created_on", "modified_on", "expires_on"]) expect(data).not.toHaveProperty(field);
	});

	it.each(
		[
			"2026-02-29T23:59:59.000Z",
			"2026-02-30T00:00:00Z",
			"2026-12-17T24:00:00Z",
			"2026-12-17T23:60:00Z",
			"2026-12-17T23:59:60Z",
			"2026-12-17T23:59:59+24:00",
			"2026-12-17T23:59:59+02:60",
			"2026-02-30 00:00:00",
			"not a date",
			"12/17/2026",
			"2026-12-17",
			"2026-12-17T23:59:59",
			"2026-12-17T23:59:59Z trailing",
			new Date(Number.NaN),
			0,
			true,
			{},
			[],
			null,
		].map((value) => [value]),
	)("rejects invalid or ambiguous date input %j without coercion", (value) => {
		expect(() => asDatabaseJson({ expires_on: value })).toThrow("Invalid certificate expires_on");
	});

	it.each(["pg", "better-sqlite3"])("leaves existing %s serialization unchanged", (client) => {
		const database = knex({ client, ...(client === "better-sqlite3" ? { useNullAsDefault: true } : {}) });
		databases.push(database);
		Model.knex(database);
		const payload = { expires_on: "2026-12-18T01:59:59.000+02:00", created_on: "2026-05-11T07:26:50.000Z" };
		expect(asDatabaseJson(payload)).toMatchObject(payload);
	});
});
