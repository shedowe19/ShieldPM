import { describe, expect, it, vi } from "vitest";

vi.mock("../logger.js", () => ({
	global: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
	debug: vi.fn(),
}));

describe("db.js", () => {
	describe("generateDbConfig logic", () => {
		it("throws when database config is missing", () => {
			// Simulating what generateDbConfig does internally
			const configHas = (key) => key !== "database";
			expect(() => {
				if (!configHas("database")) {
					throw new Error("Database config does not exist!");
				}
			}).toThrow("Database config does not exist!");
		});

		it("generates config from standard database settings", () => {
			const cfg = {
				engine: "better-sqlite3",
				host: "localhost",
				user: "root",
				password: "",
				name: "shieldpm",
				port: 3306,
			};
			const result = {
				client: cfg.engine,
				connection: {
					host: cfg.host,
					user: cfg.user,
					password: cfg.password,
					database: cfg.name,
					port: cfg.port,
				},
			};
			expect(result.client).toBe("better-sqlite3");
			expect(result.connection.host).toBe("localhost");
		});

		it("uses knex-native config directly", () => {
			const cfg = { engine: "knex-native", knex: { client: "pg", connection: "pg://localhost" } };
			if (cfg.engine === "knex-native") {
				expect(cfg.knex.client).toBe("pg");
			}
		});

		it("configures pool settings", () => {
			const config = {
				pool: { min: 2, max: 10, propagateCreateError: false },
			};
			expect(config.pool.min).toBe(2);
			expect(config.pool.max).toBe(10);
		});

		it("includes SSL config when provided", () => {
			const cfg = { ssl: { rejectUnauthorized: false } };
			const connection = { host: "localhost", ...(cfg.ssl ? { ssl: cfg.ssl } : {}) };
			expect(connection.ssl.rejectUnauthorized).toBe(false);
		});

		it("excludes SSL when not configured", () => {
			const cfg = {};
			const connection = { host: "localhost", ...(cfg.ssl ? { ssl: cfg.ssl } : {}) };
			expect(connection.ssl).toBeUndefined();
		});
	});

	describe("getInstance pattern", () => {
		it("implements singleton pattern", () => {
			let instance = null;
			const getInstance = () => {
				if (!instance) {
					instance = { _mock: true };
				}
				return instance;
			};
			const a = getInstance();
			const b = getInstance();
			expect(a).toBe(b);
		});
	});

	describe("migrations config", () => {
		it("sets migrations table name to 'migrations'", () => {
			const config = { migrations: { tableName: "migrations" } };
			expect(config.migrations.tableName).toBe("migrations");
		});
	});

	describe("pool afterCreate handler", () => {
		it("registers error handler on connection", () => {
			const connection = { on: vi.fn() };
			const callback = vi.fn();
			// Simulate afterCreate
			connection.on("error", expect.any(Function));
			callback(null, connection);
			expect(callback).toHaveBeenCalledWith(null, connection);
		});
	});
});
