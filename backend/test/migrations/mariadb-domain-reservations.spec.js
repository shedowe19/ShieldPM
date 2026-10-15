import { randomUUID } from "node:crypto";
import knex from "knex";
import { describe, it, vi } from "vitest";
import { exerciseDomainReservationContract } from "../helpers/domain-reservations.js";

vi.mock("../../logger.js", () => ({ migrate: { info: vi.fn() } }));
const mariaDb = process.env.SHIELDPM_TEST_MARIADB === "1" ? describe : describe.skip;

mariaDb("MariaDB atomic active domain reservations", () => {
	it("enforces real trigger, rollback, restoration and competing-write contracts", async () => {
		const connection = {
			host: process.env.SHIELDPM_TEST_MARIADB_HOST || "127.0.0.1",
			password: process.env.SHIELDPM_TEST_MARIADB_PASSWORD || "",
			port: Number(process.env.SHIELDPM_TEST_MARIADB_PORT || 3306),
			user: process.env.SHIELDPM_TEST_MARIADB_USER || "root",
		};
		const databaseName = `shieldpm_domains_${randomUUID().replaceAll("-", "")}`;
		const admin = knex({ client: "mysql2", connection });
		let database;
		try {
			await admin.raw("CREATE DATABASE ??", [databaseName]);
			database = knex({
				client: "mysql2",
				connection: { ...connection, database: databaseName },
				pool: { min: 0, max: 2 },
			});
			await exerciseDomainReservationContract(database);
		} finally {
			await database?.destroy();
			await admin.raw("DROP DATABASE IF EXISTS ??", [databaseName]);
			await admin.destroy();
		}
	}, 30_000);
});
