import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const INTERNAL = new Set(["migrations", "migrations_lock", "knex_migrations", "knex_migrations_lock"]);
const MASK = (1n << 256n) - 1n;
export class DatabaseCompatibilityError extends Error {
	constructor(message, publicCode = "DB_INCOMPATIBLE") {
		super(message);
		this.name = "DatabaseCompatibilityError";
		this.publicCode = publicCode;
	}
}
const fail = (message, code) => {
	throw new DatabaseCompatibilityError(message, code);
};
const dialect = (database) => {
	const client = database.client.config.client;
	if (["better-sqlite3", "sqlite3"].includes(client)) return "sqlite";
	if (["mysql", "mysql2"].includes(client)) return "mysql";
	if (["pg", "postgres", "postgresql"].includes(client)) return "pg";
	return fail("Unsupported database provider");
};
const rowsOf = (result, provider) => (provider === "pg" ? result.rows : provider === "mysql" ? result[0] : result);
const applicationTable = (name) => !name.startsWith("sqlite_") && !INTERNAL.has(name);
const query = (database, connection, table) => database(table).connection(connection);
const raw = async (database, connection, sql, bindings = []) =>
	rowsOf(await database.raw(sql, bindings).connection(connection), dialect(database));

export const listDatabaseTables = async (database, connection) => {
	const provider = dialect(database);
	if (provider === "sqlite")
		return (
			await raw(database, connection, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
		).map(({ name }) => name);
	if (provider === "mysql")
		return (
			await raw(
				database,
				connection,
				"SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name",
			)
		).map(({ name }) => name);
	return (
		await raw(
			database,
			connection,
			"SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name",
		)
	).map(({ name }) => name);
};

const readColumns = async (database, connection, table) => {
	const provider = dialect(database);
	if (provider === "sqlite")
		return (await raw(database, connection, "PRAGMA table_info(??)", [table])).map((column) => ({
			name: column.name,
			type: column.type.toLowerCase(),
			primary: Number(column.pk),
			nullable: !column.notnull,
		}));
	if (provider === "mysql")
		return (
			await raw(
				database,
				connection,
				"SELECT column_name AS name, column_type AS type, is_nullable AS nullable, column_key AS key_type, extra FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position",
				[table],
			)
		).map((column) => ({
			...column,
			primary: column.key_type === "PRI" ? 1 : 0,
			nullable: column.nullable === "YES",
		}));
	return (
		await raw(
			database,
			connection,
			`SELECT a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type, NOT a.attnotnull AS nullable,
		COALESCE(array_position(i.indkey::smallint[],a.attnum)+1,0) AS primary
		FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace
		LEFT JOIN pg_index i ON i.indrelid=t.oid AND i.indisprimary
		WHERE n.nspname=current_schema() AND t.relname=? AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,
			[table],
		)
	).map((column) => ({ ...column, primary: Number(column.primary) }));
};

const foreignKeys = async (database, connection, table) => {
	const provider = dialect(database);
	if (provider === "sqlite")
		return (await raw(database, connection, "PRAGMA foreign_key_list(??)", [table])).map((key) => ({
			column: key.from,
			table: key.table,
		}));
	if (provider === "mysql")
		return raw(
			database,
			connection,
			"SELECT column_name AS `column`, referenced_table_name AS `table` FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name=? AND referenced_table_name IS NOT NULL",
			[table],
		);
	return raw(
		database,
		connection,
		`SELECT a.attname AS "column", r.relname AS "table" FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
		JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_class r ON r.oid=c.confrelid
		JOIN LATERAL unnest(c.conkey) k(num) ON true JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.num
		WHERE c.contype='f' AND n.nspname=current_schema() AND t.relname=?`,
		[table],
	);
};

const kindOf = (type) => {
	if (/json/.test(type)) return "json";
	if (/bool|tinyint\(1\)/.test(type)) return "boolean";
	if (/timestamp|datetime|^date$/.test(type)) return "date";
	if (/int/.test(type)) return "integer";
	if (/decimal|numeric/.test(type)) return "decimal";
	if (/real|float|double/.test(type)) return "float";
	if (/blob|binary|bytea/.test(type)) return "binary";
	return "text";
};

// Decimal normalization never passes through IEEE-754, including JSON numbers.
export const canonicalDecimal = (input) => {
	const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(String(input));
	if (!match) return fail("Invalid numeric database value");
	const digits = `${match[2]}${match[3] || ""}`.replace(/^0+/, "") || "0";
	let exponent = BigInt(match[4] || "0") - BigInt((match[3] || "").length);
	const trimmed = digits.replace(/0+$/, "");
	if (digits === "0") return "0";
	exponent += BigInt(digits.length - trimmed.length);
	return `${match[1]}${trimmed}e${exponent}`;
};

export const canonicalJson = (input) => {
	const text = String(input);
	let position = 0;
	const whitespace = () => {
		while (/\s/.test(text[position] || "") && position < text.length) position++;
	};
	const parse = () => {
		whitespace();
		const character = text[position];
		if (character === '"') {
			const start = position++;
			while (position < text.length) {
				if (text[position] === "\\") position += 2;
				else if (text[position++] === '"') return ["string", JSON.parse(text.slice(start, position))];
			}
			return fail("Invalid JSON database value");
		}
		if (character === "[" || character === "{") {
			position++;
			const object = character === "{";
			const values = [];
			const keys = new Set();
			whitespace();
			const end = object ? "}" : "]";
			if (text[position] === end) {
				position++;
				return [object ? "object" : "array", values];
			}
			while (position < text.length) {
				if (object) {
					const key = parse();
					if (key[0] !== "string" || keys.has(key[1])) return fail("Duplicate or invalid JSON object key");
					keys.add(key[1]);
					whitespace();
					if (text[position++] !== ":") return fail("Invalid JSON database value");
					values.push([key[1], parse()]);
				} else values.push(parse());
				whitespace();
				if (text[position] === end) {
					position++;
					return [
						object ? "object" : "array",
						object ? values.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) : values,
					];
				}
				if (text[position++] !== ",") return fail("Invalid JSON database value");
			}
			return fail("Invalid JSON database value");
		}
		for (const word of ["true", "false", "null"])
			if (text.startsWith(word, position)) {
				position += word.length;
				return [word];
			}
		const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(position));
		if (!number) return fail("Invalid JSON database value");
		position += number[0].length;
		return ["number", canonicalDecimal(number[0])];
	};
	const result = parse();
	whitespace();
	if (position !== text.length) return fail("Invalid JSON database value");
	return JSON.stringify(result);
};

export const canonicalDate = (value) => {
	let input = String(value);
	if (/^-?\d+$/.test(input)) {
		const number = Number(input);
		if (!Number.isSafeInteger(number)) return fail("Timestamp exceeds supported range");
		const numericDate = new Date(number);
		if (!Number.isFinite(numericDate.getTime())) return fail("Timestamp exceeds supported range");
		input = numericDate.toISOString();
	}
	const match = /^(\d{4}-\d\d-\d\d)(?:[ T](\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d(?::?\d\d)?)?)?$/.exec(input);
	if (!match) return fail("Invalid or unsupported timestamp database value");
	const [year, month, day] = match[1].split("-").map(Number);
	const [hour, minute, second] = (match[2] || "00:00:00").split(":").map(Number);
	const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	if (
		year < 1 ||
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > days[month - 1] ||
		hour > 23 ||
		minute > 59 ||
		second > 59
	)
		return fail("Invalid calendar timestamp database value");
	const fraction = (match[3] || "").padEnd(6, "0");
	let zone = match[4] || "Z";
	if (/^[+-]\d\d$/.test(zone)) zone += ":00";
	const date = new Date(`${match[1]}T${match[2] || "00:00:00"}.${fraction.slice(0, 3)}${zone}`);
	if (!Number.isFinite(date.getTime())) return fail("Invalid timestamp database value");
	return `${date.toISOString().slice(0, -1)}${fraction.slice(3)}Z`;
};

const canonicalValue = (value, kind) => {
	if (value === null) return ["null"];
	if (kind === "json") return [kind, canonicalJson(value)];
	if (kind === "integer") {
		if (!/^-?\d+$/.test(String(value))) return fail("Invalid integer database value");
		return [kind, BigInt(value).toString()];
	}
	if (kind === "boolean") {
		if (!["0", "1", "true", "false"].includes(String(value))) return fail("Invalid boolean database value");
		return [kind, ["1", "true"].includes(String(value))];
	}
	if (kind === "decimal") return [kind, canonicalDecimal(value)];
	if (kind === "float") {
		const number = Number(value);
		if (!Number.isFinite(number)) return fail("Non-finite database number");
		return [kind, String(number)];
	}
	if (kind === "date") return [kind, canonicalDate(value)];
	if (kind === "binary") return [kind, Buffer.from(value).toString("base64")];
	return [kind, String(value)];
};

const selectColumns = (database, columns) =>
	columns.map((column) => {
		const provider = dialect(database);
		if (column.kind === "binary") return column.name;
		if (provider === "mysql" && column.kind === "date")
			return database.raw("DATE_FORMAT(??, '%Y-%m-%d %H:%i:%s.%f') AS ??", [column.name, column.name]);
		return database.raw(`CAST(?? AS ${provider === "mysql" ? "CHAR" : "TEXT"}) AS ??`, [column.name, column.name]);
	});

async function* batches(database, connection, table) {
	let last;
	const size = Math.max(1, Math.min(100, Math.floor(800 / table.columns.length)));
	while (true) {
		const builder = query(database, connection, table.name)
			.select(selectColumns(database, table.columns))
			.orderBy(table.primary.map((column) => ({ column: `${table.name}.${column}`, order: "asc" })))
			.limit(size);
		if (last)
			builder.where(function () {
				for (let index = 0; index < table.primary.length; index++)
					this.orWhere(function () {
						for (let prior = 0; prior < index; prior++)
							this.where(`${table.name}.${table.primary[prior]}`, last[table.primary[prior]]);
						this.where(`${table.name}.${table.primary[index]}`, ">", last[table.primary[index]]);
					});
			});
		const rows = await builder;
		if (!rows.length) return;
		yield rows;
		last = rows.at(-1);
	}
}

const makeDigest = () => ({ count: 0, sum: 0n, xor: 0n });
const addDigest = (digest, row, columns) => {
	const serialized = JSON.stringify(
		columns.map((column) => [column.name, canonicalValue(row[column.name], column.kind)]),
	);
	const hash = BigInt(`0x${crypto.createHash("sha256").update(serialized).digest("hex")}`);
	digest.sum = (digest.sum + hash) & MASK;
	digest.xor ^= hash;
	digest.count++;
	return serialized;
};
const finishDigest = (digest) => ({
	count: digest.count,
	digest: `${digest.sum.toString(16).padStart(64, "0")}:${digest.xor.toString(16).padStart(64, "0")}`,
});

const describeTable = async (database, connection, name) => {
	const columns = await readColumns(database, connection, name);
	const primary = columns
		.filter((column) => column.primary)
		.sort((a, b) => a.primary - b.primary)
		.map((column) => column.name);
	if (!primary.length) return fail(`Table ${name} has no primary key`);
	return {
		name,
		columns: columns.map((column) => ({ ...column, kind: kindOf(column.type) })),
		primary,
		foreignKeys: await foreignKeys(database, connection, name),
	};
};

const readHighWater = async (database, connection, table) => {
	if (table.primary.length !== 1) return null;
	const column = table.columns.find((item) => item.name === table.primary[0]);
	if (column.kind !== "integer") return null;
	const provider = dialect(database);
	if (provider === "sqlite") {
		if (!(await listDatabaseTables(database, connection)).includes("sqlite_sequence")) return null;
		const row = await query(database, connection, "sqlite_sequence")
			.where({ name: table.name })
			.select(database.raw("CAST(seq AS TEXT) AS value"))
			.first();
		return row?.value ?? null;
	}
	if (provider === "mysql") {
		const [row] = await raw(
			database,
			connection,
			"SELECT CAST(auto_increment AS CHAR) AS value FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?",
			[table.name],
		);
		return row?.value ? (BigInt(row.value) - 1n).toString() : null;
	}
	const [{ sequence }] = await raw(database, connection, "SELECT pg_get_serial_sequence(?,?) AS sequence", [
		database.ref(table.name).toString(),
		column.name,
	]);
	if (!sequence) return null;
	const [row] = await raw(database, connection, "SELECT CAST(last_value AS TEXT) AS value, is_called FROM ??", [
		sequence,
	]);
	return (BigInt(row.value) - (row.is_called ? 0n : 1n)).toString();
};

const orderTables = (tables) => {
	const ordered = [];
	const seen = new Set();
	while (ordered.length < tables.length) {
		const next = tables.find(
			(table) =>
				!seen.has(table.name) &&
				table.foreignKeys.every((key) => key.table === table.name || seen.has(key.table)),
		);
		if (!next) return fail("Cyclic or missing foreign-key dependency");
		seen.add(next.name);
		ordered.push(next);
	}
	return ordered;
};

const acquireSnapshot = async (database) => {
	const connection = await database.client.acquireConnection();
	const provider = dialect(database);
	let locked = false;
	try {
		if (provider === "sqlite") await raw(database, connection, "BEGIN IMMEDIATE");
		// READ COMMITTED takes its first data snapshot after the table locks are obtained.
		// REPEATABLE READ would establish a stale snapshot during table discovery before a waiting writer commits.
		else if (provider === "pg") {
			await raw(database, connection, "BEGIN ISOLATION LEVEL READ COMMITTED");
			await raw(database, connection, "SET LOCAL lock_timeout = '10s'");
		} else {
			await raw(database, connection, "SET SESSION time_zone = '+00:00'");
			await raw(database, connection, "SET SESSION lock_wait_timeout = 10");
			await raw(database, connection, "SET SESSION innodb_lock_wait_timeout = 10");
		}
		const names = await listDatabaseTables(database, connection);
		if (provider === "pg" && names.length)
			await raw(database, connection, `LOCK TABLE ${names.map(() => "??").join(",")} IN SHARE MODE`, names);
		if (provider === "mysql" && names.length) {
			const engines = await raw(
				database,
				connection,
				"SELECT ENGINE AS engine FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'",
			);
			if (engines.some((row) => row.engine?.toLowerCase() !== "innodb"))
				return fail("Only transactional InnoDB source tables are supported");
			await raw(database, connection, `LOCK TABLES ${names.map(() => "?? READ").join(",")}`, names);
			locked = true;
		}
		return {
			connection,
			release: async () => {
				try {
					await raw(database, connection, provider === "mysql" ? "UNLOCK TABLES" : "ROLLBACK");
				} finally {
					await database.client.releaseConnection(connection);
				}
			},
		};
	} catch (error) {
		try {
			if (provider !== "mysql") await raw(database, connection, "ROLLBACK");
			else if (locked) await raw(database, connection, "UNLOCK TABLES");
		} catch {}
		await database.client.releaseConnection(connection);
		throw error;
	}
};

const makeBackup = (backupPath) => {
	if (!backupPath) return null;
	fs.mkdirSync(path.dirname(backupPath), { recursive: true, mode: 0o700 });
	const temporary = `${backupPath}.${crypto.randomUUID()}.tmp`;
	const descriptor = fs.openSync(temporary, "wx", 0o600);
	return {
		write: (value) => fs.writeSync(descriptor, `${JSON.stringify(value)}\n`),
		finish: () => {
			fs.fsyncSync(descriptor);
			fs.closeSync(descriptor);
			fs.renameSync(temporary, backupPath);
			const directory = fs.openSync(path.dirname(backupPath), "r");
			try {
				fs.fsyncSync(directory);
			} finally {
				fs.closeSync(directory);
			}
		},
		abort: () => {
			try {
				fs.closeSync(descriptor);
			} catch {}
			fs.rmSync(temporary, { force: true });
		},
	};
};

const insertValue = (database, value, column, targetColumn) => {
	if (value === null) return null;
	canonicalValue(value, column.kind);
	if (column.kind === "boolean")
		return ["1", "true"].includes(String(value))
			? dialect(database) === "pg" && targetColumn.kind === "boolean"
				? true
				: 1
			: dialect(database) === "pg" && targetColumn.kind === "boolean"
				? false
				: 0;
	if (column.kind === "date") {
		const timestamp = canonicalDate(value);
		return dialect(database) === "mysql" ? timestamp.replace("T", " ").slice(0, -1) : timestamp;
	}
	if (column.kind === "json" && dialect(database) === "pg") return database.raw("?::json", [value]);
	return value;
};

const resetSequences = async (database, connection, table) => {
	if (dialect(database) === "sqlite") {
		if (table.highWater === null || !(await listDatabaseTables(database, connection)).includes("sqlite_sequence"))
			return;
		const existing = await query(database, connection, "sqlite_sequence")
			.where({ name: table.name })
			.select(database.raw("CAST(seq AS TEXT) AS value"))
			.first();
		const value = BigInt(existing?.value || "0") > BigInt(table.highWater) ? existing.value : table.highWater;
		if (existing)
			await query(database, connection, "sqlite_sequence").where({ name: table.name }).update({ seq: value });
		else await query(database, connection, "sqlite_sequence").insert({ name: table.name, seq: value });
		return;
	}
	if (dialect(database) !== "pg") return;
	for (const column of table.columns.filter((column) => column.kind === "integer")) {
		const [{ sequence }] = await raw(database, connection, "SELECT pg_get_serial_sequence(?,?) AS sequence", [
			database.ref(table.name).toString(),
			column.name,
		]);
		if (sequence)
			await raw(
				database,
				connection,
				"SELECT setval(?::regclass, GREATEST(COALESCE(MAX(??),0),?::bigint,1),GREATEST(COALESCE(MAX(??),0),?::bigint)>=1) FROM ??",
				[sequence, column.name, table.highWater || "0", column.name, table.highWater || "0", table.name],
			);
	}
};

export const verifyDatabase = async ({ database, expected }) => {
	const connection = await database.client.acquireConnection();
	try {
		if (dialect(database) === "mysql") await raw(database, connection, "SET SESSION time_zone = '+00:00'");
		const names = (await listDatabaseTables(database, connection)).filter(applicationTable).sort();
		if (JSON.stringify(names) !== JSON.stringify(expected.tables.map((table) => table.name).sort()))
			return fail("Verification table set mismatch");
		if (expected.migrations) {
			const migrations = (await query(database, connection, "migrations").select("name"))
				.map((row) => row.name)
				.sort();
			if (JSON.stringify(migrations) !== JSON.stringify(expected.migrations))
				return fail("Database migration versions differ during verification");
		}
		for (const table of expected.tables) {
			const columns = await readColumns(database, connection, table.name);
			if (
				JSON.stringify(columns.map((column) => column.name).sort()) !==
				JSON.stringify(table.columns.map((column) => column.name).sort())
			)
				return fail(`Column mismatch for ${table.name}`);
			const digest = makeDigest();
			for await (const batch of batches(database, connection, table))
				for (const row of batch) addDigest(digest, row, table.columns);
			if (JSON.stringify(finishDigest(digest)) !== JSON.stringify({ count: table.count, digest: table.digest }))
				return fail(`Database verification failed for ${table.name}`);
			if (table.highWater !== null && table.highWater !== undefined) {
				const highWater = await readHighWater(database, connection, table);
				if (highWater === null || BigInt(highWater) < BigInt(table.highWater))
					return fail(`Database sequence verification failed for ${table.name}`);
			}
		}
		return true;
	} finally {
		await database.client.releaseConnection(connection);
	}
};

/** Caller prepares a new empty target schema and stops every application writer before calling. */
export const migrateDatabase = async ({ source, target, onProgress, backupPath, onVerified }) => {
	const from = dialect(source);
	const to = dialect(target);
	if (from === to || (from !== "sqlite" && to !== "sqlite"))
		return fail("Supported migrations are SQLite to/from MySQL/MariaDB or PostgreSQL");
	const snapshot = await acquireSnapshot(source);
	let backup;
	let backupFinished = false;
	try {
		backup = makeBackup(backupPath);
		const sourceNames = (await listDatabaseTables(source, snapshot.connection)).filter(applicationTable).sort();
		let targetNames = (await listDatabaseTables(target)).filter(applicationTable).sort();
		// Older releases create this security table lazily, outside the migration chain.
		if (sourceNames.includes("login_attempts") && !targetNames.includes("login_attempts")) {
			await target.schema.createTable("login_attempts", (table) => {
				table.increments("id").primary();
				table.string("scope", 32).notNullable();
				table.string("identifier", 255).notNullable();
				table.integer("attempt_count").notNullable().defaultTo(0);
				table.bigInteger("first_attempt_at").notNullable();
				table.bigInteger("last_attempt_at").notNullable();
				table.bigInteger("blocked_until").notNullable().defaultTo(0);
				table.unique(["scope", "identifier"]);
				table.index(["last_attempt_at"]);
				table.index(["blocked_until"]);
			});
			targetNames = (await listDatabaseTables(target)).filter(applicationTable).sort();
		}
		if (JSON.stringify(sourceNames) !== JSON.stringify(targetNames))
			return fail("Source and target schemas differ; run this ShieldPM version on the source first");
		// SQL collations disagree on punctuation (notably analytics.js / analytics_logs.js).
		const migrations = (await query(source, snapshot.connection, "migrations").select("name"))
			.map((row) => row.name)
			.sort();
		const targetMigrations = (await target("migrations").select("name")).map((row) => row.name).sort();
		if (JSON.stringify(migrations) !== JSON.stringify(targetMigrations))
			return fail("Database migration versions differ");
		const tables = [];
		for (const name of sourceNames) {
			const table = await describeTable(source, snapshot.connection, name);
			table.highWater = await readHighWater(source, snapshot.connection, table);
			const destination = await describeTable(target, undefined, name);
			if (
				JSON.stringify(table.columns.map((column) => column.name).sort()) !==
				JSON.stringify(destination.columns.map((column) => column.name).sort())
			)
				return fail(`Column mismatch for ${name}`);
			// SQLite boolean/int and JSON/text differences are expected. All converted cells are read back and verified.
			table.targetColumns = Object.fromEntries(destination.columns.map((column) => [column.name, column]));
			tables.push(table);
		}
		const ordered = orderTables(tables);
		backup?.write({
			format: "shieldpm-database-v1",
			provider: from,
			migrations,
			tables: tables.map(({ targetColumns, ...table }) => table),
		});
		if (backup) {
			const sourceTables = [];
			for (const table of ordered) {
				const digest = makeDigest();
				for await (const batch of batches(source, snapshot.connection, table))
					for (const row of batch) {
						const canonical = addDigest(digest, row, table.columns);
						backup.write({ table: table.name, row: JSON.parse(canonical) });
					}
				const { targetColumns, ...description } = table;
				sourceTables.push({ ...description, ...finishDigest(digest) });
			}
			// Publish a complete, durable source export before the first target data write.
			backup.write({ complete: true, source: { tables: sourceTables } });
			backup.finish();
			backupFinished = true;
		}
		const result = { verified: true, migrations, tables: [] };
		await target.transaction(async (transaction) => {
			const connection = await transaction.client.acquireConnection();
			if (to === "mysql") {
				await raw(transaction, connection, "SET SESSION time_zone = '+00:00'");
				await raw(
					transaction,
					connection,
					"SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'NO_AUTO_VALUE_ON_ZERO', 'STRICT_ALL_TABLES')",
				);
				const engines = await raw(
					transaction,
					connection,
					"SELECT ENGINE AS engine FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'",
				);
				if (engines.some((row) => row.engine?.toLowerCase() !== "innodb"))
					return fail("Only transactional InnoDB target tables are supported");
			}
			if (to === "sqlite") await raw(transaction, connection, "PRAGMA defer_foreign_keys = ON");
			for (const table of ordered) {
				const row = await query(transaction, connection, table.name).first();
				if (row && !["setting", "host_domain_claim_lock"].includes(table.name))
					return fail(`Destination table ${table.name} is not empty`);
			}
			for (const name of ["setting", "host_domain_claim_lock"])
				if (sourceNames.includes(name)) await query(transaction, connection, name).delete();
			for (const table of ordered) {
				const digest = makeDigest();
				const selfReferences = table.foreignKeys
					.filter((key) => key.table === table.name)
					.map((key) => key.column);
				for (const name of selfReferences)
					if (!table.targetColumns[name].nullable)
						return fail(`Non-nullable self reference in ${table.name}`);
				for await (const batch of batches(source, snapshot.connection, table)) {
					const converted = batch.map((row) =>
						Object.fromEntries(
							table.columns.map((column) => [
								column.name,
								selfReferences.includes(column.name)
									? null
									: insertValue(
											transaction,
											row[column.name],
											column,
											table.targetColumns[column.name],
										),
							]),
						),
					);
					for (const row of batch) {
						addDigest(digest, row, table.columns);
					}
					await query(transaction, connection, table.name).insert(converted);
				}
				if (selfReferences.length)
					for await (const batch of batches(source, snapshot.connection, table))
						for (const row of batch) {
							const values = Object.fromEntries(selfReferences.map((name) => [name, row[name]]));
							if (Object.values(values).some((value) => value !== null))
								await query(transaction, connection, table.name)
									.where(Object.fromEntries(table.primary.map((name) => [name, row[name]])))
									.update(values);
						}
				const targetDigest = makeDigest();
				try {
					for await (const batch of batches(transaction, connection, table))
						for (const row of batch) addDigest(targetDigest, row, table.columns);
				} catch (error) {
					if (error instanceof DatabaseCompatibilityError)
						return fail(
							`Lossless verification failed for ${table.name}: destination numeric or timestamp representation is incompatible`,
							"DB_VALUE_INCOMPATIBLE",
						);
					throw error;
				}
				if (JSON.stringify(finishDigest(digest)) !== JSON.stringify(finishDigest(targetDigest))) {
					for await (const batch of batches(source, snapshot.connection, table))
						for (const row of batch) {
							const copied = await query(transaction, connection, table.name)
								.where(Object.fromEntries(table.primary.map((name) => [name, row[name]])))
								.select(selectColumns(transaction, table.columns))
								.first();
							if (!copied)
								return fail(
									`Lossless verification failed for ${table.name}: a source key cannot be preserved`,
									"DB_KEY_INCOMPATIBLE",
								);
							for (const column of table.columns)
								if (
									JSON.stringify(canonicalValue(row[column.name], column.kind)) !==
									JSON.stringify(canonicalValue(copied[column.name], column.kind))
								) {
									return fail(
										`Lossless verification failed for ${table.name}.${column.name}: the destination cannot preserve ${column.kind} precision or representation`,
										"DB_VALUE_INCOMPATIBLE",
									);
								}
						}
					return fail(`Lossless verification failed for ${table.name}`, "DB_VALUE_INCOMPATIBLE");
				}
				await resetSequences(transaction, connection, table);
				const { targetColumns, ...description } = table;
				const verified = { ...description, ...finishDigest(digest) };
				result.tables.push(verified);
				await onProgress?.({ table: table.name, count: verified.count });
			}
			if (to === "sqlite" && (await raw(transaction, connection, "PRAGMA foreign_key_check")).length)
				return fail("Foreign-key verification failed");
		});
		// MySQL ALTER TABLE commits implicitly. Restore high-water values after copy commit,
		// while activation remains blocked and the source is still locked.
		if (to === "mysql")
			for (const table of result.tables)
				if (table.highWater !== null) {
					await target.raw(`ALTER TABLE ?? AUTO_INCREMENT = ${(BigInt(table.highWater) + 1n).toString()}`, [
						table.name,
					]);
				}
		await onVerified?.(result);
		return result;
	} catch (error) {
		if (!backupFinished) backup?.abort();
		if (error instanceof DatabaseCompatibilityError) throw error;
		if (["22003", "ER_WARN_DATA_OUT_OF_RANGE", "WARN_DATA_TRUNCATED", "ER_DATA_TOO_LONG"].includes(error.code))
			throw new DatabaseCompatibilityError(
				"A source value exceeds the destination column range or precision",
				"DB_VALUE_OUT_OF_RANGE",
			);
		if (
			[
				"23505",
				"23503",
				"ER_DUP_ENTRY",
				"ER_NO_REFERENCED_ROW_2",
				"SQLITE_CONSTRAINT_FOREIGNKEY",
				"SQLITE_CONSTRAINT_UNIQUE",
			].includes(error.code)
		)
			throw new DatabaseCompatibilityError(
				"The destination key or foreign-key constraints cannot preserve the source rows",
				"DB_CONSTRAINT_INCOMPATIBLE",
			);
		// SQL driver messages can contain complete inserted credentials. Never propagate them.
		const safe = new Error(
			error.code
				? `Database copy failed (${String(error.code).replace(/[^A-Z0-9_]/gi, "")})`
				: /^(Supported migrations|Unsupported database|Source and target|Database migration|Column mismatch|Table |Cyclic |Destination table|Only transactional|Non-nullable|Lossless verification|Foreign-key|Invalid |Duplicate |Timestamp |Non-finite)/.test(
							error.message,
						)
					? error.message
					: "Database copy failed; source preserved",
		);
		throw safe;
	} finally {
		await snapshot.release();
	}
};
