/** Streaming authenticated instance archives and offline, recoverable activation. */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { PassThrough, Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import Database from "better-sqlite3";
import Knex from "knex";
import { up as removeRetiredHostRuntime } from "../migrations/20261027150000_remove_retired_host_runtime.js";
import PACKAGE from "../package.json" with { type: "json" };
import { assertSupportedDatabase, validateMysqlDump, validatePostgresCatalog } from "./backup-database-safety.js";
import { removeRetiredHostHooks } from "./retired-host-config.js";

const MAGIC = Buffer.from("SPMBKP01");
export const MAX_BACKUP_BYTES = 8 * 1024 ** 3;
const MAX_FILES = 30_000;
const MAX_MANIFEST = 16 * 1024 ** 2;
const STORE = "instance-backups";
const validId = (id) =>
	typeof id === "string" &&
	id.length === 36 &&
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);

/** Resolve one canonical archive identifier inside its private store. */
export function backupArchivePath(store, id) {
	if (
		typeof id !== "string" ||
		id.length !== 36 ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
	)
		throw new Error("Invalid backup identifier");
	const directory = path.resolve(store);
	const filename = path.resolve(directory, `${id}.spmb`);
	if (!filename.startsWith(`${directory}${path.sep}`)) throw new Error("Backup path escapes its store");
	return filename;
}

/** Metadata uses the same canonical identifier and independently checked containment. */
export function backupMetadataPath(store, id) {
	if (
		typeof id !== "string" ||
		id.length !== 36 ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
	)
		throw new Error("Invalid backup identifier");
	const directory = path.resolve(store);
	const filename = path.resolve(directory, `${id}.json`);
	if (!filename.startsWith(`${directory}${path.sep}`)) throw new Error("Backup path escapes its store");
	return filename;
}
const safePath = (name) => {
	if (
		typeof name !== "string" ||
		!name ||
		name.includes("\\") ||
		name.includes("\0") ||
		path.posix.isAbsolute(name) ||
		name.split("/").some((part) => !part || part === "." || part === "..")
	)
		throw new Error("Invalid archive path");
	return name;
};
const safeLink = (name, target) => {
	if (typeof target !== "string" || target.includes("\0") || target.includes("\\") || path.posix.isAbsolute(target))
		throw new Error("Unsafe archive link");
	const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name), target));
	if (resolved === ".." || resolved.startsWith("../") || resolved.split("/")[0] === STORE)
		throw new Error("Archive link escapes instance");
	return target;
};
/** Resolve the captured link graph component by component, including safe dangling links. */
export function validateLinkGraph(entries) {
	const links = new Map(
		entries
			.filter((entry) => entry.type === "symlink")
			.map((entry) => [safePath(entry.name), safeLink(entry.name, entry.target)]),
	);
	for (const [name, target] of links) {
		const pending = [...path.posix.dirname(name).split("/"), ...target.split("/")];
		const resolved = [];
		let hops = 0;
		while (pending.length) {
			const part = pending.shift();
			if (!part || part === ".") continue;
			if (part === "..") {
				if (!resolved.length) throw new Error("Archive link escapes instance through another link");
				resolved.pop();
				continue;
			}
			const next = [...resolved, part].join("/");
			if (next === STORE) throw new Error("Archive link enters its backup store");
			if (links.has(next)) {
				if (++hops > 40) throw new Error("Archive link cycle or excessive link depth");
				pending.unshift(...links.get(next).split("/"));
			} else resolved.push(part);
		}
	}
}
export async function privateJson(filename, value) {
	await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
	const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
	try {
		await fs.writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: "wx", flush: true });
		await fs.rename(temporary, filename);
		await syncDirectory(path.dirname(filename));
	} finally {
		await fs.rm(temporary, { force: true });
	}
}
async function syncDirectory(directory) {
	const handle = await fs.open(directory, "r");
	try {
		await handle.sync();
	} finally {
		await handle.close();
	}
}
const readJson = async (filename) => JSON.parse(await fs.readFile(filename, "utf8"));
const shaFile = async (filename) => {
	const digest = crypto.createHash("sha256");
	for await (const chunk of createReadStream(filename)) digest.update(chunk);
	return digest.digest("hex");
};
async function keyFor(password, salt) {
	if (typeof password !== "string" || password.length < 12 || Buffer.byteLength(password) > 1024)
		throw new Error("Use a password of at least 12 characters (maximum 1024 bytes)");
	return new Promise((resolve, reject) =>
		crypto.scrypt(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 ** 2 }, (error, key) =>
			error ? reject(error) : resolve(key),
		),
	);
}
function byteLimit(limit) {
	let size = 0;
	return new Transform({
		transform(chunk, _encoding, callback) {
			size += chunk.length;
			callback(size > limit ? new Error("Backup exceeds its size limit") : null, chunk);
		},
	});
}

/**
 * No shell, bounded execution/output, no credential-bearing diagnostics.
 * @param {string} binary
 * @param {string[]} args
 * @param {{env?: NodeJS.ProcessEnv, input?: string, output?: string, timeout?: number}} options
 * @returns {Promise<string>}
 */
export async function backupCommand(binary, args, { env = {}, input, output, timeout = 300_000 } = {}) {
	const child = spawn(binary, args, {
		env: { ...process.env, ...env },
		stdio: [input ? "pipe" : "ignore", "pipe", "pipe"],
	});
	let stderrBytes = 0;
	child.stderr.on("data", (chunk) => {
		stderrBytes += chunk.length;
		if (stderrBytes > 128 * 1024) child.kill("SIGKILL");
	});
	const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
	const completion = new Promise((resolve, reject) => {
		child.once("error", () => reject(new Error(`Required backup tool is unavailable: ${binary}`)));
		child.once("close", (code) =>
			code === 0 ? resolve(undefined) : reject(new Error(`Backup tool failed: ${binary}`)),
		);
	});
	const transfers = [];
	if (input) transfers.push(pipeline(createReadStream(input), child.stdin));
	let result = "";
	if (output)
		transfers.push(
			pipeline(
				child.stdout,
				byteLimit(MAX_BACKUP_BYTES),
				createWriteStream(output, { flags: "wx", mode: 0o600 }),
			),
		);
	else
		transfers.push(
			pipeline(
				child.stdout,
				byteLimit(128 * 1024),
				new Transform({
					transform(chunk, _encoding, callback) {
						result += chunk.toString();
						callback();
					},
				}),
			),
		);
	try {
		await Promise.all([completion, ...transfers]);
		return result;
	} catch (error) {
		child.kill("SIGKILL");
		await Promise.allSettled([completion, ...transfers]);
		throw error;
	} finally {
		clearTimeout(timer);
	}
}

export const providerName = (config) =>
	config.engine === "knex-native"
		? "sqlite"
		: ["mysql", "mysql2"].includes(config.engine)
			? "mysql"
			: config.engine === "pg"
				? "postgres"
				: null;
function serverConnection(config, name = config.name) {
	return Knex({
		client: config.engine === "mysql" ? "mysql2" : config.engine,
		connection: {
			host: config.host,
			port: config.port,
			user: config.user,
			password: config.password,
			database: name,
			...(config.ssl ? { ssl: config.ssl } : {}),
		},
		pool: { min: 0, max: 1 },
		acquireConnectionTimeout: 15_000,
	});
}
export async function toolCredentials(config, directory) {
	const engine = providerName(config);
	const ssl = config.ssl;
	if (ssl && typeof ssl !== "object" && ssl !== true)
		throw new Error("Unsupported database TLS configuration for native backups");
	const options = ssl && typeof ssl === "object" ? ssl : {};
	const supported = new Set([
		"ca",
		"cert",
		"key",
		"rejectUnauthorized",
		...(engine === "mysql" ? ["verifyIdentity"] : []),
	]);
	if (Object.keys(options).some((key) => !supported.has(key)))
		throw new Error("Unsupported database TLS configuration for native backups");
	if (options.verifyIdentity === true && options.rejectUnauthorized === false)
		throw new Error("Native backups cannot weaken database TLS identity verification");
	const files = {};
	for (const key of ["ca", "cert", "key"]) {
		if (options[key] === undefined) continue;
		const values = Array.isArray(options[key]) ? options[key] : [options[key]];
		if (!values.length || values.some((value) => typeof value !== "string" && !Buffer.isBuffer(value)))
			throw new Error("Unsupported database TLS material for native backups");
		files[key] = path.join(directory, `database-tls-${key}.pem`);
		await fs.writeFile(files[key], values.map((value) => value.toString()).join("\n"), { mode: 0o600 });
	}
	if (Boolean(files.cert) !== Boolean(files.key))
		throw new Error("Database TLS client certificate and key must be supplied together");
	if (engine === "postgres")
		return {
			args: [],
			env: {
				PGHOST: config.host,
				PGPORT: String(config.port || 5432),
				PGUSER: config.user,
				PGPASSWORD: config.password || "",
				PGCONNECT_TIMEOUT: "15",
				PGSSLMODE: ssl ? (options.rejectUnauthorized === false ? "require" : "verify-full") : "disable",
				PGSSLROOTCERT:
					files.ca ||
					(ssl && options.rejectUnauthorized !== false ? "/etc/ssl/certs/ca-certificates.crt" : ""),
				PGSSLCERT: files.cert || "",
				PGSSLKEY: files.key || "",
			},
		};
	const quoted = (value) =>
		`"${String(value ?? "")
			.replaceAll("\\", "\\\\")
			.replaceAll('"', '\\"')
			.replaceAll("\n", "\\n")
			.replaceAll("\r", "\\r")}"`;
	const filename = path.join(directory, "mysql-client.cnf");
	const tls = ssl
		? `\nssl=1\nssl-verify-server-cert=${options.rejectUnauthorized === false ? "0" : "1"}${Object.entries(files)
				.map(([key, filename]) => `\nssl-${key}=${quoted(filename)}`)
				.join("")}`
		: "\nskip-ssl";
	await fs.writeFile(
		filename,
		`[client]\nhost=${quoted(config.host)}\nport=${Number(config.port || 3306)}\nuser=${quoted(config.user)}\npassword=${quoted(config.password)}${tls}\n`,
		{ mode: 0o600 },
	);
	return { args: [`--defaults-extra-file=${filename}`], env: {} };
}
async function sqliteDescription(filename) {
	const database = new Database(filename, { readonly: true, fileMustExist: true });
	try {
		if (database.pragma("quick_check", { simple: true }) !== "ok")
			throw new Error("SQLite snapshot failed its integrity check");
		const tables = database
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
			.all()
			.map(({ name }) => name);
		const migrations = tables.includes("migrations")
			? database
					.prepare('SELECT name FROM "migrations" ORDER BY name')
					.all()
					.map(({ name }) => name)
			: [];
		return { tables, migrations };
	} finally {
		database.close();
	}
}
async function serverDescription(connection) {
	await assertSupportedDatabase(connection);
	const mysql = ["mysql", "mysql2"].includes(connection.client.config.client);
	const rows = await connection("information_schema.tables")
		.select(mysql ? { name: "table_name", storage_engine: "engine" } : { name: "table_name" })
		.where("table_schema", mysql ? connection.raw("DATABASE()") : "public")
		.where("table_type", "BASE TABLE")
		.orderBy("table_name");
	if (mysql && rows.some((row) => row.storage_engine && row.storage_engine.toLowerCase() !== "innodb"))
		throw new Error("Consistent MySQL instance backups require transactional InnoDB tables");
	const tables = rows.map(({ name }) => name);
	const migrations = tables.includes("migrations")
		? (await connection("migrations").select("name").orderBy("name")).map(({ name }) => name)
		: [];
	return { tables, migrations };
}
const sameDescription = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export class InstanceBackup {
	/** @param {{directory?: string, config?: any, version?: string, command?: typeof backupCommand, validateNginx?: (data: string, work: string) => Promise<void>, migrationNames?: string[], snapshotLock?: (callback: () => Promise<any>) => Promise<any>}} options */
	constructor({
		directory = process.env.DATA_PATH || "/data",
		config,
		version = PACKAGE.version,
		command = backupCommand,
		validateNginx,
		migrationNames,
		snapshotLock = (callback) => callback(),
	} = {}) {
		this.directory = path.resolve(directory);
		this.store = path.join(this.directory, STORE);
		this.config = config;
		this.version = version;
		this.command = command;
		this.validateNginx = validateNginx || ((data, work) => this.nginxCheck(data, work));
		this.migrationNames = migrationNames;
		this.snapshotLock = snapshotLock;
	}
	async requireSpace(bytes) {
		const info = await fs.statfs(this.store);
		if (Number(info.bavail) * Number(info.bsize) < bytes + 64 * 1024 ** 2)
			throw new Error("Insufficient free disk space for a recoverable backup/restore");
	}
	async initialize() {
		const info = await fs.lstat(this.directory);
		if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Unsafe instance data directory");
		await fs.mkdir(this.store, { recursive: true, mode: 0o700 });
		if ((await fs.lstat(this.store)).isSymbolicLink()) throw new Error("Unsafe backup directory");
		await fs.chmod(this.store, 0o700);
	}
	archive(id) {
		return backupArchivePath(this.store, id);
	}
	async list() {
		await this.initialize();
		const rows = [];
		for (const name of await fs.readdir(this.store)) {
			if (!/^[0-9a-f-]{36}\.json$/.test(name)) continue;
			try {
				const row = await readJson(path.join(this.store, name));
				if (validId(row.id) && typeof row.created_on === "string")
					rows.push({
						id: row.id,
						name: String(row.name || "").slice(0, 80),
						created_on: row.created_on,
						app_version: typeof row.app_version === "string" ? row.app_version : null,
						database: ["sqlite", "mysql", "postgres"].includes(row.database) ? row.database : null,
						size: Number(row.size) || 0,
					});
			} catch {
				/* Incomplete catalog entries are not exposed. */
			}
		}
		return rows.sort((a, b) => b.created_on.localeCompare(a.created_on));
	}
	async copyData(destination) {
		const entries = [];
		let total = 0;
		const visit = async (relative = "") => {
			for (const item of await fs.readdir(path.join(this.directory, relative), { withFileTypes: true })) {
				const name = relative ? `${relative}/${item.name}` : item.name;
				if (
					(!relative && [STORE, ".database"].includes(item.name)) ||
					/^shieldpm\/database\.sqlite(?:-wal|-shm)?$/.test(name)
				)
					continue;
				safePath(name);
				if (entries.length >= MAX_FILES) throw new Error("Instance contains too many files");
				const source = path.join(this.directory, name);
				const target = path.join(destination, name);
				const info = await fs.lstat(source);
				if (info.isDirectory()) {
					await fs.mkdir(target, { recursive: true, mode: 0o700 });
					entries.push({ name, type: "directory", mode: info.mode & 0o777 });
					await visit(name);
				} else if (info.isSymbolicLink()) {
					let link = await fs.readlink(source);
					if (path.isAbsolute(link)) {
						if (!link.startsWith(`${this.directory}/`))
							throw new Error("Instance contains a link outside its data directory");
						link = path.relative(path.dirname(source), link);
					}
					safeLink(name, link);
					await fs.symlink(link, target);
					entries.push({ name, type: "symlink", target: link });
				} else if (info.isFile()) {
					total += info.size;
					if (total > MAX_BACKUP_BYTES) throw new Error("Instance exceeds backup size limit");
					await this.requireSpace(info.size * 2);
					const handle = await fs.open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
					try {
						await pipeline(
							handle.createReadStream({ autoClose: false }),
							byteLimit(MAX_BACKUP_BYTES - total + info.size),
							createWriteStream(target, { flags: "wx", mode: 0o600 }),
						);
					} finally {
						await handle.close();
					}
					const size = (await fs.stat(target)).size;
					if (size !== info.size)
						throw new Error("An instance file changed while it was being copied; retry the backup");
					entries.push({ name, type: "file", size, sha256: await shaFile(target), mode: info.mode & 0o777 });
				} // Runtime sockets and devices are intentionally not persisted.
			}
		};
		await fs.mkdir(destination, { recursive: true, mode: 0o700 });
		await visit();
		validateLinkGraph(entries);
		return entries;
	}
	async snapshotDatabase(work) {
		const engine = providerName(this.config);
		if (!engine) throw new Error("Unsupported database provider");
		const filename = path.join(work, engine === "sqlite" ? "database.sqlite" : "database.dump");
		let description;
		if (engine === "sqlite") {
			const source = new Database(
				this.config.knex?.connection?.filename || path.join(this.directory, "shieldpm/database.sqlite"),
				{ fileMustExist: true },
			);
			try {
				const deadline = Date.now() + 300_000;
				await source.backup(filename, {
					progress: () => {
						if (Date.now() > deadline) throw new Error("SQLite snapshot timed out");
						return 100;
					},
				});
			} finally {
				source.close();
			}
			description = await sqliteDescription(filename);
		} else {
			const connection = serverConnection(this.config);
			try {
				description = await serverDescription(connection);
			} finally {
				await connection.destroy();
			}
			const credentials = await toolCredentials(this.config, work);
			const args =
				engine === "postgres"
					? ["--format=custom", "--no-owner", "--no-acl", "--dbname", this.config.name]
					: [
							...credentials.args,
							"--single-transaction",
							"--skip-lock-tables",
							"--skip-routines",
							"--skip-triggers",
							"--skip-events",
							"--hex-blob",
							this.config.name,
						];
			await this.command(engine === "postgres" ? "pg_dump" : "mariadb-dump", args, {
				env: credentials.env,
				output: filename,
			});
		}
		return { engine, filename, ...description };
	}
	async create(password, name = "", progress = (_phase) => {}) {
		await this.initialize();
		if ((await this.list()).length >= 50)
			throw new Error("Archive limit reached; remove an older encrypted backup first");
		const id = crypto.randomUUID();
		const work = await fs.mkdtemp(path.join(this.store, ".create-"));
		const partial = `${this.archive(id)}.tmp`;
		try {
			const salt = crypto.randomBytes(16);
			const iv = crypto.randomBytes(12);
			const key = await keyFor(password, salt);
			progress("snapshot");
			const data = path.join(work, "data");
			const { entries, database } = await this.snapshotLock(async () => ({
				entries: await this.copyData(data),
				database: await this.snapshotDatabase(work),
			}));
			await fs.mkdir(path.join(data, ".database"), { mode: 0o700 });
			const dbName = `.database/${path.basename(database.filename)}`;
			await fs.rename(database.filename, path.join(data, dbName));
			entries.push(
				{ name: ".database", type: "directory", mode: 0o700 },
				{
					name: dbName,
					type: "file",
					size: (await fs.stat(path.join(data, dbName))).size,
					sha256: await shaFile(path.join(data, dbName)),
					mode: 0o600,
				},
			);
			const manifest = {
				format: 1,
				app_version: this.version,
				created_on: new Date().toISOString(),
				database: {
					engine: database.engine,
					tables: database.tables,
					migrations: database.migrations,
					file: dbName,
				},
				entries,
			};
			const encoded = Buffer.from(JSON.stringify(manifest));
			if (encoded.length > MAX_MANIFEST) throw new Error("Manifest exceeds its size limit");
			const length = Buffer.alloc(4);
			length.writeUInt32BE(encoded.length);
			async function* payload() {
				yield length;
				yield encoded;
				for (const entry of entries)
					if (entry.type === "file") yield* createReadStream(path.join(data, entry.name));
			}
			progress("encrypting");
			const header = Buffer.concat([MAGIC, salt, iv]);
			const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
			cipher.setAAD(header);
			key.fill(0);
			await fs.writeFile(partial, header, { mode: 0o600, flag: "wx" });
			await pipeline(
				Readable.from(payload()),
				byteLimit(MAX_BACKUP_BYTES),
				createGzip(),
				cipher,
				byteLimit(MAX_BACKUP_BYTES - 52),
				createWriteStream(partial, { flags: "a", flush: true }),
			);
			await fs.appendFile(partial, cipher.getAuthTag(), { flush: true });
			await fs.rename(partial, this.archive(id));
			const row = {
				id,
				name: String(name).slice(0, 80),
				created_on: manifest.created_on,
				app_version: this.version,
				database: database.engine,
				size: (await fs.stat(this.archive(id))).size,
			};
			await privateJson(path.join(this.store, `${id}.json`), row);
			return row;
		} finally {
			await fs.rm(work, { recursive: true, force: true });
			await fs.rm(partial, { force: true });
		}
	}
	async decrypt(id, password, work) {
		const archive = backupArchivePath(this.store, id);
		const compressed = path.join(work, "payload.gz");
		// Keep one no-follow descriptor for metadata, authentication and ciphertext streaming.
		// A pathname replacement after open must never switch the inode being decrypted.
		const handle = await fs.open(archive, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		try {
			const info = await handle.stat();
			if (!info.isFile() || info.size < 52 || info.size > MAX_BACKUP_BYTES)
				throw new Error("Invalid backup archive");
			const header = Buffer.alloc(36);
			const tag = Buffer.alloc(16);
			await handle.read(header, 0, 36, 0);
			await handle.read(tag, 0, 16, info.size - 16);
			if (!header.subarray(0, 8).equals(MAGIC)) throw new Error("Unsupported backup format");
			const key = await keyFor(password, header.subarray(8, 24));
			const decipher = crypto.createDecipheriv("aes-256-gcm", key, header.subarray(24));
			decipher.setAAD(header);
			decipher.setAuthTag(tag);
			key.fill(0);
			try {
				await pipeline(
					handle.createReadStream({ start: 36, end: info.size - 17, autoClose: false }),
					decipher,
					createWriteStream(compressed, { flags: "wx", mode: 0o600 }),
				);
			} catch {
				throw new Error("Backup password is incorrect or the archive was modified");
			}
		} finally {
			await handle.close();
		}
		const unpacked = new PassThrough();
		const pumping = pipeline(createReadStream(compressed), createGunzip(), byteLimit(MAX_BACKUP_BYTES), unpacked);
		pumping.catch(() => {}); // The iterator observes the same failure; never leave an unhandled stream error.
		const iterator = unpacked[Symbol.asyncIterator]();
		let buffered = Buffer.alloc(0);
		const read = async (size) => {
			while (buffered.length < size) {
				const next = await iterator.next();
				if (next.done) throw new Error("Truncated backup payload");
				buffered = Buffer.concat([buffered, next.value]);
			}
			const value = buffered.subarray(0, size);
			buffered = buffered.subarray(size);
			return value;
		};
		try {
			const length = (await read(4)).readUInt32BE();
			if (length > MAX_MANIFEST) throw new Error("Manifest exceeds its size limit");
			const manifest = JSON.parse((await read(length)).toString("utf8"));
			if (
				manifest.format !== 1 ||
				manifest.app_version !== this.version ||
				!Array.isArray(manifest.entries) ||
				manifest.entries.length > MAX_FILES ||
				!["sqlite", "mysql", "postgres"].includes(manifest.database?.engine)
			)
				throw new Error("Backup version or manifest is incompatible with this installation");
			const installed =
				this.migrationNames ||
				(await fs.readdir(new URL("../migrations/", import.meta.url))).filter((name) => name.endsWith(".js"));
			if (
				!Array.isArray(manifest.database.migrations) ||
				manifest.database.migrations.some((name) => typeof name !== "string" || !installed.includes(name))
			)
				throw new Error("Backup database migration history is incompatible with this installation");
			const declared = manifest.entries.reduce(
				(sum, entry) =>
					sum +
					(entry.type === "file" && Number.isSafeInteger(entry.size) && entry.size >= 0 ? entry.size : 0),
				0,
			);
			if (declared > MAX_BACKUP_BYTES) throw new Error("Backup exceeds its size limit");
			await this.requireSpace(declared * 3);
			const data = path.join(work, "data");
			await fs.mkdir(data, { mode: 0o700 });
			const names = new Set();
			let total = 0;
			validateLinkGraph(manifest.entries);
			const parents = new Map(manifest.entries.map((entry) => [entry.name, entry.type]));
			for (const entry of manifest.entries) {
				safePath(entry.name);
				if (names.has(entry.name) || entry.name.split("/")[0] === STORE)
					throw new Error("Invalid duplicate or reserved archive entry");
				for (let parent = path.posix.dirname(entry.name); parent !== "."; parent = path.posix.dirname(parent)) {
					if (parents.get(parent) !== "directory")
						throw new Error("Archive writes through an invalid parent");
				}
				names.add(entry.name);
				const target = path.join(data, entry.name);
				if (entry.type === "directory") await fs.mkdir(target, { recursive: true, mode: 0o700 });
				else if (entry.type === "symlink") {
					safeLink(entry.name, entry.target);
					await fs.symlink(entry.target, target);
				} else if (entry.type === "file") {
					if (!Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256))
						throw new Error("Invalid file metadata");
					total += entry.size;
					if (total > MAX_BACKUP_BYTES) throw new Error("Backup exceeds its size limit");
					const file = await fs.open(target, "wx", 0o600);
					const hash = crypto.createHash("sha256");
					try {
						for (let left = entry.size; left > 0; ) {
							const chunk = await read(Math.min(left, 64 * 1024));
							await file.writeFile(chunk);
							hash.update(chunk);
							left -= chunk.length;
						}
						await file.sync();
					} finally {
						await file.close();
					}
					if (hash.digest("hex") !== entry.sha256) throw new Error("Backup file hash mismatch");
					await fs.chmod(target, Number(entry.mode) & 0o777);
				} else throw new Error("Unsupported archive entry");
			}
			if (buffered.length || !(await iterator.next()).done) throw new Error("Unexpected backup payload data");
			return manifest;
		} finally {
			unpacked.destroy();
			await pumping.catch(() => {});
		}
	}
	async restoreDatabase(manifest, data, work, keep = false, onRetiredHosts = (_ids) => {}) {
		const descriptor = manifest.database;
		const source = path.join(data, safePath(descriptor.file));
		if (descriptor.engine !== providerName(this.config))
			throw new Error("Restore requires the same database provider as the running instance");
		if (descriptor.engine === "sqlite") {
			const description = await sqliteDescription(source);
			if (!sameDescription(description, { tables: descriptor.tables, migrations: descriptor.migrations }))
				throw new Error("Backup database schema differs from its manifest");
			await fs.mkdir(path.join(data, "shieldpm"), { recursive: true, mode: 0o700 });
			await fs.copyFile(source, path.join(data, "shieldpm/database.sqlite"));
			if (description.tables.includes("proxy_host")) {
				const staged = Knex({
					client: "better-sqlite3",
					connection: { filename: path.join(data, "shieldpm/database.sqlite") },
					useNullAsDefault: true,
				});
				try {
					onRetiredHosts(await staged.transaction(removeRetiredHostRuntime));
				} finally {
					await staged.destroy();
				}
			}
			let configuration = {};
			try {
				configuration = await readJson(path.join(data, "shieldpm/default.json"));
			} catch {
				/* Prefer an explicit path to any stale backed-up SQLite location. */
			}
			await privateJson(path.join(data, "shieldpm/default.json"), {
				...configuration,
				database: {
					engine: "knex-native",
					knex: {
						client: "better-sqlite3",
						connection: { filename: path.join(this.directory, "shieldpm/database.sqlite") },
						useNullAsDefault: true,
					},
				},
			});
			return null;
		}
		if (descriptor.engine === "postgres")
			validatePostgresCatalog(await this.command("pg_restore", ["--list", source]));
		else await validateMysqlDump(source);
		const clone = `shieldpm_restore_${crypto.randomBytes(10).toString("hex")}`;
		const connection = serverConnection(this.config);
		let created = false;
		let succeeded = false;
		try {
			await connection.raw(
				descriptor.engine === "postgres" ? "CREATE DATABASE ?? TEMPLATE template0" : "CREATE DATABASE ??",
				[clone],
			);
			created = true;
			const credentials = await toolCredentials(this.config, work);
			if (descriptor.engine === "postgres")
				await this.command(
					"pg_restore",
					["--exit-on-error", "--no-owner", "--no-acl", "--dbname", clone, source],
					{ env: credentials.env },
				);
			else await this.command("mariadb", [...credentials.args, "--binary-mode", clone], { input: source });
			const restored = serverConnection(this.config, clone);
			let description;
			try {
				description = await serverDescription(restored);
				if (description.tables.includes("proxy_host"))
					onRetiredHosts(await restored.transaction(removeRetiredHostRuntime));
			} finally {
				await restored.destroy();
			}
			if (!sameDescription(description, { tables: descriptor.tables, migrations: descriptor.migrations }))
				throw new Error("Isolated database restore failed its schema check");
			if (keep) {
				let configuration = {};
				try {
					configuration = await readJson(path.join(data, "shieldpm/default.json"));
				} catch {
					/* Environment-backed instances need an explicit provider override after cloning. */
				}
				await privateJson(path.join(data, "shieldpm/default.json"), {
					...configuration,
					database: { ...this.config, name: clone },
				});
				succeeded = true;
				return clone;
			}
			return null;
		} finally {
			if (created && (!keep || !succeeded)) await connection.raw("DROP DATABASE ??", [clone]);
			await connection.destroy();
		}
	}
	async dropClone(clone, config = this.config) {
		if (!/^shieldpm_restore_[0-9a-f]{20}$/.test(clone)) throw new Error("Invalid restored database name");
		const connection = serverConnection(config);
		try {
			await connection.raw("DROP DATABASE ??", [clone]);
		} finally {
			await connection.destroy();
		}
	}
	async upgradeRestoredHostConfigurations(data, retiredHostIds = []) {
		const disabled = new Set(retiredHostIds);
		const directory = path.join(data, "nginx", "proxy_host");
		let entries;
		try {
			const info = await fs.lstat(directory);
			if (!info.isDirectory() || info.isSymbolicLink())
				throw new Error("Restored proxy configuration must be a directory");
			entries = await fs.readdir(directory, { withFileTypes: true });
		} catch (error) {
			if (error.code === "ENOENT") return;
			throw error;
		}
		if (entries.length > MAX_FILES) throw new Error("Too many restored proxy configuration files");
		for (const entry of entries) {
			const match = /^([0-9]+)\.conf(?:\.(bak|err))?$/.exec(entry.name);
			if (!match) continue;
			if (disabled.has(Number(match[1]))) {
				await fs.unlink(path.join(directory, entry.name));
				continue;
			}
			if (match[2]) continue;
			const handle = await fs.open(
				path.join(directory, entry.name),
				constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
			);
			try {
				const info = await handle.stat();
				if (!info.isFile() || info.size > MAX_MANIFEST)
					throw new Error("Restored proxy configuration must be a bounded file");
				const original = await handle.readFile("utf8");
				const clean = removeRetiredHostHooks(original);
				if (clean !== original)
					throw new Error(
						"Backup contains retired request hooks without matching protected-host metadata; regenerate the host configuration before creating a new backup",
					);
			} finally {
				await handle.close();
			}
		}
	}
	async nginxCheck(data, work) {
		const original = process.env.NGINX_CONF_DIRECTORY || "/usr/local/nginx/conf";
		const target = path.join(work, "nginx");
		await fs.cp(original, target, { recursive: true, verbatimSymlinks: true });
		const runtime = path.join(work, "runtime");
		await fs.mkdir(runtime, { recursive: true, mode: 0o700 });
		for (const name of [
			"nginx",
			"nginx/client_body_temp",
			"nginx/proxy_temp",
			"nginx/fastcgi_temp",
			"nginx/uwsgi_temp",
			"nginx/scgi_temp",
			"goa",
		])
			await fs.mkdir(path.join(runtime, name), { recursive: true });
		const configurationData = path.join(work, "validation-data");
		for (const name of ["nginx", "custom_nginx"]) {
			try {
				await fs.cp(path.join(data, name), path.join(configurationData, name), {
					recursive: true,
					mode: constants.COPYFILE_FICLONE,
					verbatimSymlinks: true,
				});
			} catch (error) {
				if (error.code !== "ENOENT") throw error;
			}
		}
		const replacements = new Map([
			[`${original}/`, `${target}/`],
			["/run/shieldpm/", `${runtime}/`],
		]);
		for (const root of new Set([this.directory, "/data"])) {
			replacements.set(`${root}/nginx/`, `${configurationData}/nginx/`);
			replacements.set(`${root}/custom_nginx/`, `${configurationData}/custom_nginx/`);
			replacements.set(`${root}/`, `${data}/`);
		}
		const pattern = new RegExp(
			[...replacements.keys()]
				.sort((a, b) => b.length - a.length)
				.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
				.join("|"),
			"g",
		);
		const rewrite = async (directory) => {
			for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
				const filename = path.join(directory, entry.name);
				if (entry.isSymbolicLink()) {
					const resolved = await fs.realpath(filename);
					if (![target, configurationData].some((root) => resolved.startsWith(`${root}/`)))
						throw new Error("Nginx validation configuration link escapes its isolated tree");
				} else if (entry.isDirectory()) await rewrite(filename);
				else if (entry.isFile()) {
					if ((await fs.stat(filename)).size > MAX_MANIFEST)
						throw new Error("Nginx validation configuration file is too large");
					let content = await fs.readFile(filename, "utf8");
					if (content.includes("\0")) throw new Error("Nginx validation configuration must be text");
					content = content.replace(pattern, (match) => replacements.get(match));
					await fs.writeFile(filename, content);
				}
			}
		};
		await rewrite(target);
		await rewrite(configurationData);
		const master = path.join(target, "nginx.conf");
		let content = await fs.readFile(master, "utf8");
		const pid = `pid ${runtime}/nginx/nginx.pid;`;
		content = /^\s*pid\s+[^;]+;/m.test(content) ? content.replace(/^\s*pid\s+[^;]+;/m, pid) : `${pid}\n${content}`;
		for (const name of ["client_body", "proxy", "fastcgi", "uwsgi", "scgi"]) {
			const directive = `${name}_temp_path`;
			const pattern = new RegExp(`(^[ \\t]*${directive}\\s+)[^;\\s]+`, "m");
			const location = `${runtime}/nginx/${name}_temp`;
			content = pattern.test(content)
				? content.replace(pattern, (_match, prefix) => `${prefix}${location}`)
				: content.replace(/(^\s*http\s*\{)/m, (_match, opening) => `${opening}\n    ${directive} ${location};`);
		}
		await fs.writeFile(master, content);
		await this.command(
			process.env.NGINX_BIN || "nginx",
			["-e", "stderr", "-p", "/usr/local/nginx/", "-c", master, "-tq"],
			{ timeout: 60_000 },
		);
	}
	async verify(id, password, { schedule = false, progress = (_phase) => {}, beforeSchedule = async () => {} } = {}) {
		await this.initialize();
		if (schedule && (await this.pending())) throw new Error("A restore is already pending; cancel it first");
		const work = await fs.mkdtemp(path.join(this.store, ".restore-"));
		let keep = false;
		let clone = null;
		try {
			progress("decrypting");
			const manifest = await this.decrypt(id, password, work);
			progress("database");
			let retiredHostIds = [];
			clone = await this.restoreDatabase(manifest, path.join(work, "data"), work, schedule, (ids) => {
				retiredHostIds = ids;
			});
			progress("validating");
			await this.upgradeRestoredHostConfigurations(path.join(work, "data"), retiredHostIds);
			await this.validateNginx(path.join(work, "data"), work);
			// Validate without executing the backed-up environment file.
			try {
				await fs.access(path.join(work, "data/.env"));
				await this.command("sh", ["-n", path.join(work, "data/.env")], { timeout: 10_000 });
			} catch (error) {
				if (error.code !== "ENOENT") throw error;
			}
			await fs.rm(path.join(work, "data/.database"), { recursive: true, force: true });
			for (const name of await fs.readdir(work))
				if (name !== "data") await fs.rm(path.join(work, name), { recursive: true, force: true });
			if (schedule) {
				await beforeSchedule();
				const activationEntries = await this.describeData(path.join(work, "data"));
				await privateJson(path.join(work, "verified.json"), {
					id,
					manifest,
					clone,
					config: this.config,
					activation_entries: activationEntries,
				});
				await privateJson(path.join(this.store, "pending.json"), {
					id,
					work: path.basename(work),
					phase: "pending",
					created_on: new Date().toISOString(),
				});
				keep = true;
			}
			return {
				id,
				valid: true,
				activation: schedule ? "next_restart" : null,
				app_version: manifest.app_version,
				database: manifest.database.engine,
				files: manifest.entries.length,
			};
		} finally {
			if (!keep) {
				if (clone) await this.dropClone(clone);
				await fs.rm(work, { recursive: true, force: true });
			}
		}
	}
	async describeData(directory) {
		const entries = [];
		const visit = async (relative = "") => {
			for (const item of (await fs.readdir(path.join(directory, relative), { withFileTypes: true })).sort(
				(a, b) => a.name.localeCompare(b.name),
			)) {
				const name = relative ? `${relative}/${item.name}` : item.name;
				const filename = path.join(directory, name);
				if (item.isDirectory()) {
					entries.push({ name, type: "directory" });
					await visit(name);
				} else if (item.isFile())
					entries.push({
						name,
						type: "file",
						size: (await fs.stat(filename)).size,
						sha256: await shaFile(filename),
					});
				else if (item.isSymbolicLink())
					entries.push({ name, type: "symlink", target: safeLink(name, await fs.readlink(filename)) });
				else throw new Error("Unexpected file in restore staging directory");
			}
		};
		await visit();
		validateLinkGraph(entries);
		return entries;
	}
	async pending() {
		try {
			return await readJson(path.join(this.store, "pending.json"));
		} catch (error) {
			if (error.code === "ENOENT") return null;
			throw error;
		}
	}
	async cancel() {
		const pending = await this.pending();
		if (!pending) return;
		if (!["pending", "rejected"].includes(pending.phase))
			throw new Error("An activated restore cannot be canceled through the running instance");
		const work = this.pendingWork(pending);
		const record = await readJson(path.join(work, "verified.json"));
		if (record.clone) await this.dropClone(record.clone, record.config);
		await fs.rm(path.join(this.store, "pending.json"));
		await syncDirectory(this.store);
		await fs.rm(work, { recursive: true, force: true });
	}
	async remove(id) {
		const archive = backupArchivePath(this.store, id);
		const metadata = backupMetadataPath(this.store, id);
		if ((await this.pending())?.id === id)
			throw new Error("Cancel the pending restore before removing its archive");
		await fs.rm(archive);
		await fs.rm(metadata, { force: true });
	}
	pendingWork(pending) {
		if (!/^\.restore-[A-Za-z0-9]+$/.test(pending.work)) throw new Error("Invalid restore staging path");
		return path.join(this.store, pending.work);
	}
	async apply() {
		const pending = await this.pending();
		if (!pending) return false;
		await this.initialize();
		if (["activated", "activating"].includes(pending.phase)) {
			await this.rollback(pending);
			return false;
		}
		if (pending.phase === "rejected") return false;
		if (pending.phase !== "pending") throw new Error("Restore requires manual recovery");
		const work = this.pendingWork(pending);
		const record = await readJson(path.join(work, "verified.json"));
		const staged = path.join(work, "data");
		const previous = path.join(work, "previous");
		if (
			record.manifest.app_version !== this.version ||
			!sameDescription(await this.describeData(staged), record.activation_entries)
		) {
			pending.phase = "rejected";
			await privateJson(path.join(this.store, "pending.json"), pending);
			return false;
		}
		await fs.mkdir(previous, { mode: 0o700 });
		await syncDirectory(work);
		// Persist the entire intended move set before the first mutation. Recovery
		// consults the actual previous directory, including an interrupted rename.
		pending.phase = "activating";
		pending.previous = (await fs.readdir(this.directory)).filter((name) => name !== STORE);
		pending.installed = await fs.readdir(staged);
		await privateJson(path.join(this.store, "pending.json"), pending);
		try {
			for (const name of pending.previous) {
				await fs.rename(path.join(this.directory, name), path.join(previous, name));
				await syncDirectory(previous);
				await syncDirectory(this.directory);
			}
			for (const name of pending.installed) {
				await fs.rename(path.join(staged, name), path.join(this.directory, name));
				await syncDirectory(this.directory);
				await syncDirectory(staged);
			}
			pending.phase = "activated";
			await privateJson(path.join(this.store, "pending.json"), pending);
			return true;
		} catch (error) {
			await this.rollback(pending);
			throw error;
		}
	}
	async rollback(pending) {
		const work = this.pendingWork(pending);
		const previous = path.join(work, "previous");
		for (const name of pending.installed || []) {
			if (!(pending.previous || []).includes(name))
				await fs.rm(path.join(this.directory, safePath(name)), { recursive: true, force: true });
		}
		for (const name of await fs.readdir(previous)) {
			safePath(name);
			await fs.rm(path.join(this.directory, name), { recursive: true, force: true });
			await fs.rename(path.join(previous, name), path.join(this.directory, name));
			await syncDirectory(this.directory);
			await syncDirectory(previous);
		}
		pending.phase = "rolled_back";
		await privateJson(path.join(work, "failed.json"), pending);
		await fs.rm(path.join(this.store, "pending.json"));
		await syncDirectory(this.store);
	}
	async commit() {
		const pending = await this.pending();
		if (pending?.phase !== "activated") return false;
		await privateJson(path.join(this.pendingWork(pending), "completed.json"), {
			completed_on: new Date().toISOString(),
			id: pending.id,
		});
		await fs.rm(path.join(this.store, "pending.json"));
		await syncDirectory(this.store);
		// Keep the previous instance privately for explicit recovery; never delete it at startup.
		return true;
	}
}
