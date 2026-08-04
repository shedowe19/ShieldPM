import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	isPostgres: vi.fn(),
	raw: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({ isPostgres: mocks.isPostgres }));

import { resetPostgresSequence } from "../../lib/db-sequence.js";

describe("PostgreSQL sequence repair", () => {
	beforeEach(() => {
		mocks.isPostgres.mockReset().mockReturnValue(false);
		mocks.raw.mockReset().mockResolvedValue(undefined);
	});

	it("does nothing for non-PostgreSQL databases", async () => {
		const model = { knex: vi.fn(), tableName: "firewall_policy" };

		await resetPostgresSequence(model);

		expect(model.knex).not.toHaveBeenCalled();
	});

	it("advances the table sequence after explicit-ID restores", async () => {
		mocks.isPostgres.mockReturnValue(true);
		const knex = { raw: mocks.raw };
		const model = { knex: () => knex, tableName: "firewall_policy" };

		await resetPostgresSequence(model);

		expect(mocks.raw).toHaveBeenCalledWith(
			"SELECT setval(pg_get_serial_sequence(?, ?), COALESCE((SELECT MAX(??) FROM ??), 1), EXISTS (SELECT 1 FROM ??));",
			["firewall_policy", "id", "id", "firewall_policy", "firewall_policy"],
		);
	});
});
