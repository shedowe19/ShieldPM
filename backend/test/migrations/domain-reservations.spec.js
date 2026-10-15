import knex from "knex";
import { describe, expect, it, vi } from "vitest";
import { translateDomainReservationError } from "../../lib/domain-reservations.js";
import { exerciseDomainReservationContract } from "../helpers/domain-reservations.js";
import { createPostgres } from "../helpers/postgres.js";

vi.mock("../../logger.js", () => ({ migrate: { info: vi.fn() } }));

describe("atomic active host domain reservations", () => {
	it.each(["sqlite", "postgres"])(
		"enforces cross-type lifecycle and transaction boundaries in %s",
		async (engine) => {
			const embedded = engine === "postgres" ? await createPostgres() : null;
			const database =
				embedded?.database ||
				knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
			try {
				if (engine === "sqlite") await database.raw("PRAGMA foreign_keys = ON");
				await exerciseDomainReservationContract(database);
			} finally {
				if (embedded) await embedded.close();
				else await database.destroy();
			}
		},
		30_000,
	);

	it("preserves unrelated database failures and the original cause of native reservation conflicts", () => {
		const unrelated = new Error("unrelated unique constraint");
		expect(() => translateDomainReservationError(unrelated)).toThrow(unrelated);
		const wrapped = {
			nativeError: new Error('duplicate key violates unique constraint "host_domain_reservation_domain_unique"'),
		};
		try {
			translateDomainReservationError(wrapped);
		} catch (error) {
			expect(error).toMatchObject({ name: "ValidationError", previous: wrapped, public: true, status: 400 });
			return;
		}
		throw new Error("Expected reservation conflict to throw");
	});
});
