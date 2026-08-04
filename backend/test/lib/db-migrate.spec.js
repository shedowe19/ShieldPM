import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const knexClient = {};
	return {
		dbFactory: vi.fn(() => knexClient),
		knexClient,
		resetPostgresSequence: vi.fn(),
	};
});

vi.mock("../../db.js", () => ({ default: mocks.dbFactory }));
vi.mock("../../migrate.js", () => ({ migrateUp: vi.fn() }));
vi.mock("../../lib/config.js", () => ({ isSqlite: vi.fn() }));
vi.mock("../../lib/db-sequence.js", () => ({ resetPostgresSequence: mocks.resetPostgresSequence }));
vi.mock("../../logger.js", () => ({ global: {} }));

import { resetCopiedFirewallPolicySequence, TABLES } from "../../lib/db-migrate.js";

describe("cross-database firewall policy migration", () => {
	beforeEach(() => {
		mocks.dbFactory.mockClear();
		mocks.resetPostgresSequence.mockReset().mockResolvedValue(undefined);
	});

	it("copies firewall policies before their proxy-host foreign keys", () => {
		expect(TABLES).toContain("firewall_policy");
		expect(TABLES.indexOf("firewall_policy")).toBeLessThan(TABLES.indexOf("proxy_host"));
	});

	it("repairs the firewall policy sequence after an explicit-ID SQLite copy", async () => {
		await resetCopiedFirewallPolicySequence();

		const [model] = mocks.resetPostgresSequence.mock.calls[0];
		expect(model).toMatchObject({ tableName: "firewall_policy" });
		expect(model.knex()).toBe(mocks.knexClient);
	});
});
