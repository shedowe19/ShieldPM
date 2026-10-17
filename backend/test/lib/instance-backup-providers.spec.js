import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ queries: [], connections: [], objects: [] }));
vi.mock("knex", () => ({
	default: vi.fn((configuration) => {
		const connection = (table) => ({
			select() {
				return this;
			},
			where() {
				return this;
			},
			orderBy() {
				return Promise.resolve(
					table === "migrations" ? [{ name: "migration.js" }] : [{ name: "migrations" }, { name: "user" }],
				);
			},
		});
		connection.client = { config: configuration };
		connection.raw = vi.fn(async (sql, parameters) => {
			if (sql.startsWith("SELECT"))
				return configuration.client === "pg" ? { rows: state.objects } : [state.objects];
			state.queries.push({ sql, parameters });
		});
		connection.destroy = vi.fn().mockResolvedValue(undefined);
		state.connections.push(configuration);
		return connection;
	}),
}));

import { InstanceBackup, toolCredentials } from "../../lib/instance-backup.js";

describe("provider-native backup and isolated external restore commands", () => {
	let directory;
	beforeEach(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-provider-"));
		state.queries.length = 0;
		state.connections.length = 0;
		state.objects.length = 0;
	});
	afterEach(async () => {
		await fs.rm(directory, { recursive: true, force: true });
	});
	for (const [engine, binary] of [
		["mysql2", "mariadb-dump"],
		["pg", "pg_dump"],
	]) {
		it(`${engine} snapshots the complete provider through bounded argv without password arguments`, async () => {
			const command = vi.fn(async (_binary, _args, options) => {
				await fs.writeFile(options.output, "synthetic dump");
				return "";
			});
			const config = {
				engine,
				host: "localhost",
				port: engine === "pg" ? 5432 : 3306,
				user: "backup-user",
				password: "synthetic password with $ and ' chars",
				name: "shieldpm",
			};
			const instance = new InstanceBackup({ directory, config, command });
			const snapshot = await instance.snapshotDatabase(directory);
			expect(snapshot.tables).toEqual(["migrations", "user"]);
			expect(command.mock.calls[0][0]).toBe(binary);
			expect(command.mock.calls[0][1].join(" ")).not.toContain(config.password);
			if (engine === "pg") {
				expect(command.mock.calls[0][1]).toContain("--format=custom");
				expect(command.mock.calls[0][2].env.PGPASSWORD).toBe(config.password);
			} else {
				expect(command.mock.calls[0][1]).toContain("--single-transaction");
				const credentials = path.join(directory, "mysql-client.cnf");
				expect((await fs.stat(credentials)).mode & 0o777).toBe(0o600);
				expect(await fs.readFile(credentials, "utf8")).toContain(config.password);
			}
		});
		it(`${engine} rehearses in a fresh database and drops it, never overwriting the active database`, async () => {
			const data = path.join(directory, "data");
			await fs.mkdir(path.join(data, ".database"), { recursive: true });
			await fs.writeFile(
				path.join(data, ".database/database.dump"),
				"CREATE TABLE `user` (`id` int); INSERT INTO `user` VALUES (1);",
			);
			const command = vi.fn().mockResolvedValue("");
			const config = { engine, host: "localhost", user: "user", password: "private", name: "active_database" };
			const instance = new InstanceBackup({ directory, config, command });
			await instance.restoreDatabase(
				{
					database: {
						engine: engine === "pg" ? "postgres" : "mysql",
						file: ".database/database.dump",
						tables: ["migrations", "user"],
						migrations: ["migration.js"],
					},
				},
				data,
				directory,
			);
			const ddl = state.queries.filter(({ sql }) => sql.includes("DATABASE ??"));
			expect(ddl.map(({ sql }) => sql)).toEqual([
				engine === "pg" ? "CREATE DATABASE ?? TEMPLATE template0" : "CREATE DATABASE ??",
				"DROP DATABASE ??",
			]);
			const clone = ddl[0].parameters[0];
			expect(clone).toMatch(/^shieldpm_restore_/);
			expect(clone).not.toBe(config.name);
			expect(command.mock.calls.find((call) => call[1].includes(clone))).toBeTruthy();
			expect(ddl[1].parameters).toEqual([clone]);
		});
		it(`${engine} removes a failed isolated restore and preserves the original target`, async () => {
			const data = path.join(directory, "data");
			await fs.mkdir(path.join(data, ".database"), { recursive: true });
			await fs.writeFile(
				path.join(data, ".database/database.dump"),
				"CREATE TABLE `user` (`id` int); INSERT INTO `user` VALUES (1);",
			);
			const instance = new InstanceBackup({
				directory,
				config: { engine, host: "localhost", name: "active_database" },
				command: vi.fn(async (_binary, args) => {
					if (args.includes("--list")) return "";
					throw new Error("controlled restore failure");
				}),
			});
			await expect(
				instance.restoreDatabase(
					{ database: { engine: engine === "pg" ? "postgres" : "mysql", file: ".database/database.dump" } },
					data,
					directory,
					true,
				),
			).rejects.toThrow("controlled restore failure");
			expect(state.queries.map(({ sql }) => sql)).toEqual([
				engine === "pg" ? "CREATE DATABASE ?? TEMPLATE template0" : "CREATE DATABASE ??",
				"DROP DATABASE ??",
			]);
			expect(JSON.stringify(state.queries)).not.toContain("active_database");
		});
	}
	for (const engine of ["mysql2", "pg"]) {
		it(`${engine} preserves custom TLS CA and mutual-auth material in private native client files`, async () => {
			const config = {
				engine,
				host: "db.example.test",
				user: "backup",
				password: "private",
				ssl: { ca: "synthetic-ca", cert: "synthetic-cert", key: "synthetic-key", rejectUnauthorized: true },
			};
			const credentials = await toolCredentials(config, directory);
			for (const key of ["ca", "cert", "key"]) {
				const filename = path.join(directory, `database-tls-${key}.pem`);
				expect(await fs.readFile(filename, "utf8")).toBe(`synthetic-${key}`);
				expect((await fs.stat(filename)).mode & 0o777).toBe(0o600);
			}
			if (engine === "pg") {
				expect(credentials.env.PGSSLMODE).toBe("verify-full");
				expect(credentials.env.PGSSLROOTCERT).toBe(path.join(directory, "database-tls-ca.pem"));
				expect(credentials.env.PGSSLCERT).toBe(path.join(directory, "database-tls-cert.pem"));
				expect(credentials.env.PGSSLKEY).toBe(path.join(directory, "database-tls-key.pem"));
			} else {
				const client = await fs.readFile(path.join(directory, "mysql-client.cnf"), "utf8");
				expect(client).toContain("ssl-verify-server-cert=1");
				for (const key of ["ca", "cert", "key"]) expect(client).toContain(`ssl-${key}=`);
			}
			expect(credentials.args.join(" ")).not.toContain(config.password);
		});
		it(`${engine} rejects unsupported TLS restrictions instead of silently weakening them`, async () => {
			await expect(toolCredentials({ engine, ssl: { minVersion: "TLSv1.3" } }, directory)).rejects.toThrow(
				"Unsupported database TLS",
			);
		});
		it(`${engine} refuses programmable source objects before a dump is started`, async () => {
			state.objects.push({ object_type: "event" });
			const command = vi.fn();
			const instance = new InstanceBackup({ directory, config: { engine, name: "active" }, command });
			await expect(instance.snapshotDatabase(directory)).rejects.toThrow("do not support custom");
			expect(command).not.toHaveBeenCalled();
		});
	}
	it("rejects enabled events and schema-qualified SQL from imported MySQL dumps before creating any database", async () => {
		const data = path.join(directory, "data");
		await fs.mkdir(path.join(data, ".database"), { recursive: true });
		const instance = new InstanceBackup({
			directory,
			config: { engine: "mysql2", name: "active" },
			command: vi.fn(),
		});
		for (const dump of [
			"/*!50106 CREATE EVENT `bad` ON SCHEDULE EVERY 1 SECOND DO DELETE FROM active.user */;",
			"INSERT INTO `active`.`user` VALUES (1);",
		]) {
			await fs.writeFile(path.join(data, ".database/database.dump"), dump);
			await expect(
				instance.restoreDatabase(
					{ database: { engine: "mysql", file: ".database/database.dump" } },
					data,
					directory,
				),
			).rejects.toThrow("unsupported programmable or schema-qualified");
			expect(state.queries).toEqual([]);
		}
	});
	it("rejects unsupported PostgreSQL dump objects before creating any database", async () => {
		const data = path.join(directory, "data");
		await fs.mkdir(path.join(data, ".database"), { recursive: true });
		await fs.writeFile(path.join(data, ".database/database.dump"), "dump");
		const instance = new InstanceBackup({
			directory,
			config: { engine: "pg" },
			command: vi.fn().mockResolvedValue("4; 1255 1 FUNCTION public bad() owner"),
		});
		await expect(
			instance.restoreDatabase(
				{ database: { engine: "postgres", file: ".database/database.dump" } },
				data,
				directory,
			),
		).rejects.toThrow("unsupported programmable PostgreSQL");
		expect(state.queries).toEqual([]);
	});
});
