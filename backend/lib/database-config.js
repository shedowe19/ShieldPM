import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Knex from "knex";

export const databaseDirectory = () => path.join(process.env.DATA_PATH || "/data", "shieldpm");
export const managedConfigPath = () => path.join(databaseDirectory(), "database.json");
export const sqlitePath = () => path.join(databaseDirectory(), "database.sqlite");
export const readPrivateJson = (filename) => {
	try {
		const info = fs.lstatSync(filename);
		if (!info.isFile() || info.isSymbolicLink()) throw new Error("Invalid configuration file");
		return JSON.parse(fs.readFileSync(filename, "utf8"));
	} catch (error) {
		if (error.code === "ENOENT") return null;
		throw new Error("Could not read database configuration");
	}
};

/** Flush both file contents and the parent directory before acknowledging a state change. */
export const writePrivateJson = (filename, value) => {
	fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
	const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
	let descriptor;
	try {
		descriptor = fs.openSync(temporary, "wx", 0o600);
		fs.writeFileSync(descriptor, JSON.stringify(value));
		fs.fsyncSync(descriptor);
		fs.closeSync(descriptor);
		descriptor = undefined;
		fs.renameSync(temporary, filename);
		const directory = fs.openSync(path.dirname(filename), "r");
		try {
			fs.fsyncSync(directory);
		} finally {
			fs.closeSync(directory);
		}
	} finally {
		if (descriptor !== undefined) fs.closeSync(descriptor);
		fs.rmSync(temporary, { force: true });
	}
};

export const normalizeDatabase = (input) => {
	if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid database configuration");
	if (input.engine === "sqlite") return { engine: "sqlite" };
	if (!["mysql2", "pg"].includes(input.engine)) throw new Error("Unsupported database engine");
	for (const key of ["host", "user", "name"]) {
		if (
			typeof input[key] !== "string" ||
			!input[key].trim() ||
			input[key].length > 255 ||
			[...input[key]].some((character) => character.charCodeAt(0) < 32)
		) {
			throw new Error("Invalid database connection fields");
		}
	}
	const port = input.port ?? (input.engine === "pg" ? 5432 : 3306);
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid database port");
	if (input.password !== undefined && (typeof input.password !== "string" || input.password.length > 4096)) {
		throw new Error("Invalid database password");
	}
	if (input.ssl !== undefined && typeof input.ssl !== "boolean") throw new Error("Invalid TLS configuration");
	return {
		engine: input.engine,
		host: input.host,
		port,
		user: input.user,
		name: input.name,
		password: input.password || "",
		ssl: input.ssl || false,
	};
};

export const toLegacyDatabase = (database) =>
	database.engine === "sqlite"
		? {
				engine: "knex-native",
				knex: {
					client: "better-sqlite3",
					connection: { filename: path.join(databaseDirectory(), database.filename || "database.sqlite") },
					useNullAsDefault: true,
				},
			}
		: {
				...database,
				ssl:
					database.ssl === true
						? {
								rejectUnauthorized: true,
								...(database.engine === "mysql2" ? { verifyIdentity: true } : {}),
							}
						: database.ssl,
			};

export const readManagedDatabase = () => {
	const saved = readPrivateJson(managedConfigPath());
	if (!saved) {
		if (fs.existsSync(managedConfigPath())) throw new Error("Invalid saved database configuration");
		return null;
	}
	if (saved.version !== 1 || !saved.database) throw new Error("Invalid saved database configuration");
	const database = normalizeDatabase(saved.database);
	if (database.engine === "sqlite" && saved.database.filename) {
		if (!/^database(?:-[0-9a-f-]{36})?\.sqlite$/.test(saved.database.filename))
			throw new Error("Invalid saved SQLite filename");
		database.filename = saved.database.filename;
	}
	return { ...saved, database };
};

/** Inspect configured selection without generating keys, opening SQLite, or importing any model. */
export const inspectDatabaseSelection = () => {
	const managed = readManagedDatabase();
	if (managed) return { database: toLegacyDatabase(managed.database), source: "managed", explicit: true };
	const legacy = readPrivateJson(path.join(databaseDirectory(), "default.json"));
	if (legacy?.database) return { database: legacy.database, source: "file", explicit: true };
	if (fs.existsSync(path.join(databaseDirectory(), "default.json")))
		return { database: null, source: "file", explicit: true };
	const bool = (value) => /^(1|true|yes|on)$/i.test((value || "").trim());
	for (const [prefix, engine, defaultPort] of [
		["DB_MYSQL", "mysql2", 3306],
		["DB_POSTGRES", "pg", 5432],
	]) {
		if (["HOST", "USER", "NAME", "PASSWORD", "PORT"].some((key) => process.env[`${prefix}_${key}`])) {
			if (!["HOST", "USER", "NAME"].every((key) => process.env[`${prefix}_${key}`]))
				throw new Error("Incomplete explicit database configuration");
			const database = {
				engine,
				host: process.env[`${prefix}_HOST`],
				user: process.env[`${prefix}_USER`],
				name: process.env[`${prefix}_NAME`],
				password: process.env[`${prefix}_PASSWORD`],
				port: process.env[`${prefix}_PORT`] || defaultPort,
			};
			if (engine === "mysql2")
				database.ssl = bool(process.env.DB_MYSQL_SSL)
					? {
							rejectUnauthorized:
								process.env.DB_MYSQL_SSL_REJECT_UNAUTHORIZED === undefined ||
								bool(process.env.DB_MYSQL_SSL_REJECT_UNAUTHORIZED),
							verifyIdentity:
								process.env.DB_MYSQL_SSL_VERIFY_IDENTITY === undefined ||
								bool(process.env.DB_MYSQL_SSL_VERIFY_IDENTITY),
						}
					: false;
			return { database, source: "environment", explicit: true };
		}
	}
	return { database: toLegacyDatabase({ engine: "sqlite" }), source: "default", explicit: false };
};

export const engineOf = (database) =>
	database.engine === "knex-native" ? "sqlite" : database.engine === "mysql" ? "mysql2" : database.engine;
export const createDatabase = (database) => {
	const client = engineOf(database);
	const config =
		client === "sqlite"
			? { ...(database.knex || toLegacyDatabase(database).knex), pool: { min: 1, max: 1 } }
			: {
					client,
					connection: {
						host: database.host,
						port: database.port,
						user: database.user,
						password: database.password,
						database: database.name,
						...(database.ssl
							? {
									ssl:
										database.ssl === true
											? {
													rejectUnauthorized: true,
													...(client === "mysql2" ? { verifyIdentity: true } : {}),
												}
											: database.ssl,
								}
							: {}),
						...(client === "mysql2"
							? { dateStrings: true, supportBigNumbers: true, bigNumberStrings: true }
							: {}),
					},
					pool: { min: 0, max: 1 },
					acquireConnectionTimeout: 10_000,
				};
	return Knex(config);
};

export const listDatabaseTables = async (database) => {
	const client = database.client.config.client;
	if (client === "better-sqlite3")
		return (await database("sqlite_master").select("name").where("type", "table")).filter(
			({ name }) => !name.startsWith("sqlite_"),
		);
	return database("information_schema.tables")
		.select({ name: "table_name" })
		.where("table_schema", client === "pg" ? database.raw("current_schema()") : database.raw("DATABASE()"));
};
