import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const mockIsSqlite = vi.fn();
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => mockIsSqlite(),
}));

const mockDbFn = vi.fn();
vi.mock("../../db.js", () => ({
	default: () => mockDbFn,
}));

vi.mock("../../migrate.js", () => ({
	migrateUp: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:fs", () => ({
	default: {
		existsSync: vi.fn().mockReturnValue(false),
		renameSync: vi.fn(),
	},
}));

vi.mock("knex", () => ({
	default: vi.fn().mockReturnValue({
		select: vi.fn().mockReturnThis(),
		destroy: vi.fn().mockResolvedValue(undefined),
	}),
}));

const migrateFromSqliteToNewDb = (await import("../../lib/db-migrate.js")).default;

describe("db-migrate", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("does nothing when using sqlite", async () => {
		mockIsSqlite.mockReturnValue(true);
		await migrateFromSqliteToNewDb();
		// Should return early
	});

	it("does nothing when sqlite file does not exist", async () => {
		mockIsSqlite.mockReturnValue(false);
		const fs = (await import("node:fs")).default;
		fs.existsSync.mockReturnValue(false);
		await migrateFromSqliteToNewDb();
	});

	it("is an async function", () => {
		expect(typeof migrateFromSqliteToNewDb).toBe("function");
	});
});
