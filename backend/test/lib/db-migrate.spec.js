import { describe, expect, it, vi } from "vitest";

vi.mock("../../db.js", () => ({ default: vi.fn() }));
vi.mock("../../migrate.js", () => ({ migrateUp: vi.fn() }));
vi.mock("../../lib/config.js", () => ({ isSqlite: vi.fn() }));
vi.mock("../../logger.js", () => ({ global: {} }));

import { TABLES } from "../../lib/db-migrate.js";

describe("cross-database migration table order", () => {
	it("copies firewall policies before their proxy-host foreign keys", () => {
		expect(TABLES).toContain("firewall_policy");
		expect(TABLES.indexOf("firewall_policy")).toBeLessThan(TABLES.indexOf("proxy_host"));
	});
});
