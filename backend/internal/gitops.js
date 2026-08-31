import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv/dist/2020.js";
import git from "isomorphic-git";
import { transaction } from "objection";
import { isDemoMode } from "../lib/config.js";
import { decrypt, encrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import { global as logger } from "../logger.js";
import DeadHost from "../models/dead_host.js";
import HostDomain from "../models/host_domain.js";
import ProxyHost from "../models/proxy_host.js";
import RedirectionHost from "../models/redirection_host.js";
import settingModel from "../models/setting.js";
import Stream from "../models/stream.js";
import internalAuditLog from "./audit-log.js";
import {
	assertSafeSnapshotPath,
	containsSecretMaterial,
	createSecureGitHttp,
	readRegularFile,
	redactSecrets,
	resolveSnapshotPath,
	sha256,
	validateBranch,
	validateRepositoryUrl,
} from "./gitops-security.js";
import internalNginx from "./nginx.js";

const GITOPS_DIR = process.env.GITOPS_DIR || "/data/gitops";
const CONFIG_SUBDIR = "shieldpm-config";
const MANIFEST_FILE = "manifest.json";
const JOURNAL_FILE = path.join(GITOPS_DIR, ".transaction.json");
const MAX_FILES = 1000;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_DATABASE_BACKUP_ROWS = MAX_FILES * 4;
const MAX_DATABASE_BACKUP_BYTES = MAX_TOTAL_BYTES;
const MAX_HISTORY = 50;
const PUBLIC_PROJECTION = "shieldpm-public-config-v2";
const RUNTIME_TYPES = ["proxy_host", "redirection_host", "dead_host", "stream"];

const stringSchema = (maxLength = 2048) => ({ type: "string", minLength: 1, maxLength });
const nullableId = { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] };
const bool = { type: "boolean" };
const domains = {
	type: "array",
	minItems: 1,
	maxItems: 100,
	uniqueItems: true,
	items: { type: "string", minLength: 1, maxLength: 253, pattern: "^[^\\s/]+$" },
};

const objectSchema = (properties, required) => ({
	type: "object",
	additionalProperties: false,
	required,
	properties,
});

/** @type {Record<string, any>} */
const MODEL_SPECS = {
	proxy_host: {
		dir: "proxy-hosts",
		model: ProxyHost,
		graph: "[host_domains, access_list, certificate]",
		fields: [
			"id",
			"domain_names",
			"forward_scheme",
			"forward_host",
			"forward_port",
			"access_list_id",
			"certificate_id",
			"ssl_forced",
			"caching_enabled",
			"block_exploits",
			"allow_websocket_upgrade",
			"http2_support",
			"hsts_enabled",
			"hsts_subdomains",
			"enabled",
			"maintenance_on_failure",
			"disable_buffering",
			"maintenance_active",
			"maintenance_start",
			"maintenance_end",
			"bandwidth_limit",
			"adv_limit_req_rate",
			"adv_limit_req_unit",
			"adv_limit_req_burst",
			"forward_query",
		],
		schema: objectSchema(
			{
				id: { type: "integer", minimum: 1 },
				domain_names: domains,
				forward_scheme: { type: "string", enum: ["http", "https", "path", "grpc", "grpcs", "terminal"] },
				forward_host: stringSchema(255),
				forward_port: { type: "integer", minimum: 1, maximum: 65535 },
				access_list_id: nullableId,
				certificate_id: nullableId,
				ssl_forced: bool,
				caching_enabled: bool,
				block_exploits: bool,
				allow_websocket_upgrade: bool,
				http2_support: bool,
				hsts_enabled: bool,
				hsts_subdomains: bool,
				enabled: bool,
				maintenance_on_failure: bool,
				disable_buffering: bool,
				maintenance_active: bool,
				maintenance_start: { type: ["string", "null"], maxLength: 40 },
				maintenance_end: { type: ["string", "null"], maxLength: 40 },
				bandwidth_limit: { type: ["string", "null"], maxLength: 32 },
				adv_limit_req_rate: { type: ["integer", "null"], minimum: 1, maximum: 1_000_000 },
				adv_limit_req_unit: { type: ["string", "null"], enum: ["s", "m", null] },
				adv_limit_req_burst: { type: ["integer", "null"], minimum: 0, maximum: 1_000_000 },
				forward_query: { type: ["string", "null"], maxLength: 2048 },
			},
			["id", "domain_names", "forward_scheme", "forward_host", "forward_port", "enabled"],
		),
	},
	redirection_host: {
		dir: "redirection-hosts",
		model: RedirectionHost,
		graph: "[certificate]",
		fields: [
			"id",
			"domain_names",
			"forward_http_code",
			"forward_scheme",
			"forward_domain_name",
			"preserve_path",
			"certificate_id",
			"ssl_forced",
			"block_exploits",
			"hsts_enabled",
			"hsts_subdomains",
			"http2_support",
			"enabled",
		],
		schema: objectSchema(
			{
				id: { type: "integer", minimum: 1 },
				domain_names: domains,
				forward_http_code: { type: "integer", enum: [300, 301, 302, 303, 307, 308] },
				forward_scheme: { type: "string", enum: ["auto", "http", "https"] },
				forward_domain_name: stringSchema(253),
				preserve_path: bool,
				certificate_id: nullableId,
				ssl_forced: bool,
				block_exploits: bool,
				hsts_enabled: bool,
				hsts_subdomains: bool,
				http2_support: bool,
				enabled: bool,
			},
			["id", "domain_names", "forward_http_code", "forward_scheme", "forward_domain_name", "enabled"],
		),
	},
	dead_host: {
		dir: "dead-hosts",
		model: DeadHost,
		graph: "[certificate]",
		fields: [
			"id",
			"domain_names",
			"certificate_id",
			"ssl_forced",
			"hsts_enabled",
			"hsts_subdomains",
			"http2_support",
			"enabled",
		],
		schema: objectSchema(
			{
				id: { type: "integer", minimum: 1 },
				domain_names: domains,
				certificate_id: nullableId,
				ssl_forced: bool,
				hsts_enabled: bool,
				hsts_subdomains: bool,
				http2_support: bool,
				enabled: bool,
			},
			["id", "domain_names", "enabled"],
		),
	},
	stream: {
		dir: "streams",
		model: Stream,
		graph: "[certificate]",
		fields: [
			"id",
			"incoming_port",
			"forwarding_host",
			"forwarding_port",
			"tcp_forwarding",
			"udp_forwarding",
			"proxy_protocol_forwarding",
			"certificate_id",
			"enabled",
		],
		schema: objectSchema(
			{
				id: { type: "integer", minimum: 1 },
				incoming_port: { type: "integer", minimum: 1, maximum: 65535 },
				forwarding_host: stringSchema(255),
				forwarding_port: { type: "integer", minimum: 1, maximum: 65535 },
				tcp_forwarding: bool,
				udp_forwarding: bool,
				proxy_protocol_forwarding: bool,
				certificate_id: nullableId,
				enabled: bool,
			},
			[
				"id",
				"incoming_port",
				"forwarding_host",
				"forwarding_port",
				"tcp_forwarding",
				"udp_forwarding",
				"enabled",
			],
		),
	},
};

const ajv = new /** @type {any} */ (Ajv)({
	allErrors: true,
	strict: true,
	allowUnionTypes: true,
	coerceTypes: false,
});
for (const spec of Object.values(MODEL_SPECS)) {
	spec.validate = ajv.compile(spec.schema);
}

const manifestSchema = objectSchema(
	{
		version: { const: 2 },
		projection: { const: PUBLIC_PROJECTION },
		complete: { const: true },
		files: {
			type: "array",
			maxItems: MAX_FILES,
			items: objectSchema(
				{
					path: stringSchema(240),
					kind: { type: "string", enum: Object.keys(MODEL_SPECS) },
					id: { type: "integer", minimum: 1 },
					sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
					size: { type: "integer", minimum: 1, maximum: 256 * 1024 },
				},
				["path", "kind", "id", "sha256", "size"],
			),
		},
		counts: objectSchema(
			Object.fromEntries(Object.keys(MODEL_SPECS).map((kind) => [kind, { type: "integer", minimum: 0 }])),
			Object.keys(MODEL_SPECS),
		),
	},
	["version", "projection", "complete", "files", "counts"],
);
const validateManifest = ajv.compile(manifestSchema);

/** @typedef {import("../lib/types.js").Access} Access */

/**
 * @typedef {Object} GitOpsConfig
 * @property {boolean} enabled
 * @property {string} repository_url
 * @property {string} branch
 * @property {"https"} auth_type
 * @property {string} encrypted_credentials
 * @property {boolean} auto_push
 * @property {boolean} auto_pull_on_startup
 * @property {string|null} last_sync
 * @property {string|null} last_error
 */

let operationTail = Promise.resolve();

const withLock = async (operation) => {
	const previous = operationTail;
	let release;
	operationTail = new Promise((resolve) => {
		release = resolve;
	});
	await previous;
	try {
		return await operation();
	} finally {
		release();
	}
};

const ensureDir = async () => {
	await fs.promises.mkdir(GITOPS_DIR, { recursive: true, mode: 0o700 });
};

const getConfigDir = () => path.join(GITOPS_DIR, CONFIG_SUBDIR);

const fsyncDirectory = async (directory) => {
	let handle;
	try {
		handle = await fs.promises.open(directory, fs.constants.O_RDONLY);
		await handle.sync();
	} finally {
		await handle?.close();
	}
};

const writeDurableFile = async (filePath, content, mode = 0o640) => {
	const handle = await fs.promises.open(filePath, "wx", mode);
	try {
		await handle.writeFile(content);
		await handle.sync();
	} finally {
		await handle.close();
	}
};

const fsyncSnapshotTree = async (root) => {
	for (const spec of Object.values(MODEL_SPECS)) {
		const directory = path.join(root, spec.dir);
		try {
			await fsyncDirectory(directory);
		} catch (err) {
			if (err.code !== "ENOENT") throw err;
		}
	}
	await fsyncDirectory(root);
};

const writeJournal = async (journal) => {
	await ensureDir();
	const temporary = `${JOURNAL_FILE}.${process.pid}.${Date.now()}.tmp`;
	const handle = await fs.promises.open(temporary, "wx", 0o600);
	try {
		await handle.writeFile(JSON.stringify(journal));
		await handle.sync();
	} finally {
		await handle.close();
	}
	await fs.promises.rename(temporary, JOURNAL_FILE);
	await fsyncDirectory(GITOPS_DIR);
};

const clearJournal = async () => {
	await fs.promises.unlink(JOURNAL_FILE).catch((err) => {
		if (err.code !== "ENOENT") throw err;
	});
	await fsyncDirectory(GITOPS_DIR);
};

const pickPublicFields = (row, spec) => {
	const output = {};
	for (const field of spec.fields) {
		if (row[field] !== undefined) output[field] = row[field];
	}
	return /** @type {Object} */ (redactSecrets(output));
};

const validationMessage = (validator) =>
	validator.errors?.map((entry) => `${entry.instancePath || "/"} ${entry.message}`).join("; ") || "invalid data";

const parseArtifact = (content, kind) => {
	let data;
	try {
		data = JSON.parse(content);
	} catch (_err) {
		throw new TypeError("Snapshot artifact must be strict JSON-compatible YAML");
	}
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		throw new TypeError("Snapshot artifact must contain one object");
	}
	if (containsSecretMaterial(data)) {
		throw new TypeError("Snapshot artifact contains secret or redacted material");
	}
	const spec = MODEL_SPECS[kind];
	if (!spec.validate(data)) {
		throw new TypeError(`Snapshot ${kind} schema rejected: ${validationMessage(spec.validate)}`);
	}
	return data;
};

const enumerateSnapshotEntries = async (root) => {
	const entries = [];
	let visited = 0;
	const allowedDirectories = new Set(Object.values(MODEL_SPECS).map((spec) => spec.dir));
	const walk = async (directory, prefix = "") => {
		for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
			visited++;
			if (visited > MAX_FILES + allowedDirectories.size + 1) {
				throw new RangeError("Snapshot contains too many entries");
			}
			if (entry.isSymbolicLink()) throw new TypeError("Snapshot must not contain symbolic links");
			const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
			const fullPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				if (prefix || !allowedDirectories.has(entry.name)) {
					throw new TypeError("Snapshot contains an unexpected directory");
				}
				await walk(fullPath, relative);
			} else if (entry.isFile()) entries.push(relative);
			else throw new TypeError("Snapshot must contain regular files only");
		}
	};
	await walk(root);
	return entries.sort();
};

const loadSnapshot = async (root) => {
	await assertSafeSnapshotPath(root);
	const manifestBuffer = await readRegularFile(path.join(root, MANIFEST_FILE), 1024 * 1024);
	let manifest;
	try {
		manifest = JSON.parse(manifestBuffer.toString("utf8"));
	} catch (_err) {
		throw new TypeError("Snapshot manifest is not valid JSON");
	}
	if (!validateManifest(manifest)) {
		throw new TypeError(`Snapshot manifest rejected: ${validationMessage(validateManifest)}`);
	}

	const pathSet = new Set();
	const idSet = new Set();
	const counts = Object.fromEntries(Object.keys(MODEL_SPECS).map((kind) => [kind, 0]));
	const artifacts = [];
	let totalBytes = manifestBuffer.length;
	for (const file of manifest.files) {
		const expectedPath = `${MODEL_SPECS[file.kind].dir}/${file.id}.yaml`;
		if (file.path !== expectedPath) {
			throw new TypeError(`Manifest path does not match artifact kind: ${file.path}`);
		}
		if (pathSet.has(file.path) || idSet.has(`${file.kind}:${file.id}`)) {
			throw new TypeError("Snapshot manifest contains duplicate paths or identifiers");
		}
		pathSet.add(file.path);
		idSet.add(`${file.kind}:${file.id}`);
		const buffer = await readRegularFile(await assertSafeSnapshotPath(root, file.path));
		totalBytes += buffer.length;
		if (totalBytes > MAX_TOTAL_BYTES) throw new RangeError("Snapshot exceeds the total size limit");
		if (buffer.length !== file.size || sha256(buffer) !== file.sha256) {
			throw new Error(`Snapshot integrity check failed for ${file.path}`);
		}
		const data = /** @type {any} */ (parseArtifact(buffer.toString("utf8"), file.kind));
		if (data.id !== file.id) throw new TypeError(`Artifact ID does not match manifest: ${file.path}`);
		artifacts.push({ ...file, data });
		counts[file.kind]++;
	}
	for (const kind of Object.keys(MODEL_SPECS)) {
		if (counts[kind] !== manifest.counts[kind]) throw new TypeError(`Manifest count mismatch for ${kind}`);
	}

	const actualEntries = await enumerateSnapshotEntries(root);
	const expectedEntries = [MANIFEST_FILE, ...manifest.files.map((file) => file.path)].sort();
	if (
		actualEntries.length !== expectedEntries.length ||
		actualEntries.some((entry, index) => entry !== expectedEntries[index])
	) {
		throw new TypeError("Snapshot contains unlisted or missing files");
	}
	return { manifest, artifacts };
};

const copyVerifiedSnapshot = async (source, destination) => {
	const snapshot = await loadSnapshot(source);
	await fs.promises.mkdir(destination, { recursive: false, mode: 0o700 });
	for (const file of snapshot.manifest.files) {
		const sourcePath = await assertSafeSnapshotPath(source, file.path);
		const destinationPath = resolveSnapshotPath(destination, file.path);
		await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
		await writeDurableFile(destinationPath, await readRegularFile(sourcePath));
	}
	await writeDurableFile(path.join(destination, MANIFEST_FILE), `${JSON.stringify(snapshot.manifest, null, 2)}\n`);
	await fsyncSnapshotTree(destination);
	return loadSnapshot(destination);
};

const recoverSnapshotJournal = async () => {
	let journal;
	try {
		journal = JSON.parse((await readRegularFile(JOURNAL_FILE, MAX_TOTAL_BYTES + 4 * 1024 * 1024)).toString("utf8"));
	} catch (err) {
		if (err.code === "ENOENT") return;
		throw err;
	}
	if (journal?.kind === "runtime-stage") {
		await recoverRuntimeJournal(journal);
		return;
	}
	if (
		journal?.kind !== "snapshot-swap" ||
		!["prepared", "old-moved", "installed", "committed"].includes(journal.phase) ||
		typeof journal.target !== "string" ||
		typeof journal.stage !== "string" ||
		typeof journal.backup !== "string" ||
		typeof journal.had_target !== "boolean" ||
		journal.target !== getConfigDir() ||
		path.dirname(journal.stage) !== GITOPS_DIR ||
		!path.basename(journal.stage).startsWith(".snapshot-stage-") ||
		path.dirname(journal.backup) !== GITOPS_DIR ||
		!path.basename(journal.backup).startsWith(".snapshot-backup-")
	) {
		throw new Error("Refusing malformed GitOps recovery journal");
	}

	if (journal.phase === "committed") {
		await loadSnapshot(journal.target);
		await fs.promises.rm(journal.stage, { recursive: true, force: true });
		await fs.promises.rm(journal.backup, { recursive: true, force: true });
		await clearJournal();
		logger.warn("GitOps completed cleanup for a committed snapshot swap");
		return;
	}

	let backupExists = false;
	try {
		const backupStats = await fs.promises.lstat(journal.backup);
		if (backupStats.isSymbolicLink() || !backupStats.isDirectory()) {
			throw new Error("GitOps snapshot backup is not a real directory");
		}
		backupExists = true;
	} catch (err) {
		if (err.code !== "ENOENT") throw err;
	}
	if (backupExists) {
		await fs.promises.rm(journal.target, { recursive: true, force: true });
		await fs.promises.rename(journal.backup, journal.target);
	} else if (journal.had_target && journal.phase !== "prepared") {
		throw new Error("GitOps snapshot backup required for recovery is missing");
	} else if (!journal.had_target && journal.phase !== "prepared") {
		await fs.promises.rm(journal.target, { recursive: true, force: true });
	}
	await fs.promises.rm(journal.stage, { recursive: true, force: true });
	await fs.promises.rm(journal.backup, { recursive: true, force: true });
	await fsyncDirectory(GITOPS_DIR);
	await clearJournal();
	logger.warn("GitOps recovered an interrupted snapshot swap before applying runtime configuration");
};

const installSnapshot = async (source) => {
	await ensureDir();
	await recoverSnapshotJournal();
	const operationId = `${process.pid}-${Date.now()}`;
	const target = getConfigDir();
	const stage = path.join(GITOPS_DIR, `.snapshot-stage-${operationId}`);
	const backup = path.join(GITOPS_DIR, `.snapshot-backup-${operationId}`);
	let journalActive = false;
	try {
		await copyVerifiedSnapshot(source, stage);
		let hadTarget = false;
		try {
			const targetStats = await fs.promises.lstat(target);
			if (targetStats.isSymbolicLink() || !targetStats.isDirectory()) {
				throw new Error("GitOps snapshot target is not a real directory");
			}
			hadTarget = true;
		} catch (err) {
			if (err.code !== "ENOENT") throw err;
		}
		try {
			await fs.promises.lstat(backup);
			throw new Error("Refusing to overwrite an existing GitOps snapshot backup");
		} catch (err) {
			if (err.code !== "ENOENT") throw err;
		}
		const journal = { kind: "snapshot-swap", target, stage, backup, had_target: hadTarget };
		await writeJournal({ ...journal, phase: "prepared" });
		journalActive = true;
		if (hadTarget) {
			await fs.promises.rename(target, backup);
		}
		await fsyncDirectory(GITOPS_DIR);
		await writeJournal({ ...journal, phase: "old-moved" });
		await fs.promises.rename(stage, target);
		await fsyncDirectory(GITOPS_DIR);
		await writeJournal({ ...journal, phase: "installed" });
		await loadSnapshot(target);
		await writeJournal({ ...journal, phase: "committed" });
		try {
			await fs.promises.rm(backup, { recursive: true, force: true });
			await fsyncDirectory(GITOPS_DIR);
			await clearJournal();
		} catch (cleanupError) {
			logger.warn(`GitOps committed with deferred snapshot cleanup: ${cleanupError.message}`);
			await recoverSnapshotJournal().catch((recoveryError) => {
				logger.warn(`GitOps deferred snapshot cleanup remains pending: ${recoveryError.message}`);
			});
		}
	} catch (err) {
		if (journalActive) {
			await recoverSnapshotJournal().catch((recoveryError) => {
				err.message = `${err.message}; snapshot rollback failed: ${recoveryError.message}`;
			});
		} else {
			await fs.promises.rm(stage, { recursive: true, force: true }).catch(() => {});
		}
		throw err;
	}
};

const createSnapshot = async () => {
	await ensureDir();
	const temporaryRoot = await fs.promises.mkdtemp(path.join(GITOPS_DIR, ".snapshot-export-"));
	const files = [];
	const counts = Object.fromEntries(Object.keys(MODEL_SPECS).map((kind) => [kind, 0]));
	try {
		const rowsByKind = await transaction(ProxyHost.knex(), async (trx) => {
			const rows = {};
			for (const [kind, spec] of Object.entries(MODEL_SPECS)) {
				let query = spec.model.query(trx).where("is_deleted", 0).orderBy("id", "asc");
				if (spec.graph) query = query.withGraphFetched(spec.graph);
				rows[kind] = await query;
			}
			return rows;
		});
		for (const [kind, spec] of Object.entries(MODEL_SPECS)) {
			for (const row of rowsByKind[kind]) {
				const data = pickPublicFields(row, spec);
				if (!spec.validate(data)) {
					throw new TypeError(
						`Cannot export invalid ${kind} #${row.id}: ${validationMessage(spec.validate)}`,
					);
				}
				if (containsSecretMaterial(data)) throw new Error(`Refusing secret-bearing ${kind} #${row.id}`);
				const relativePath = `${spec.dir}/${row.id}.yaml`;
				const target = resolveSnapshotPath(temporaryRoot, relativePath);
				await fs.promises.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
				const content = `${JSON.stringify(data, null, 2)}\n`;
				await writeDurableFile(target, content);
				const buffer = Buffer.from(content);
				files.push({ path: relativePath, kind, id: row.id, sha256: sha256(buffer), size: buffer.length });
				counts[kind]++;
			}
		}
		const manifest = {
			version: 2,
			projection: PUBLIC_PROJECTION,
			complete: true,
			files,
			counts,
		};
		await writeDurableFile(path.join(temporaryRoot, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
		await fsyncSnapshotTree(temporaryRoot);
		await loadSnapshot(temporaryRoot);
		return { temporaryRoot, manifest };
	} catch (err) {
		await fs.promises.rm(temporaryRoot, { recursive: true, force: true });
		throw err;
	}
};

const getStoredConfig = async () => {
	const setting = await settingModel.query().where("id", "gitops-config").first();
	if (!setting) throw new errs.ItemNotFoundError("gitops-config");
	return /** @type {GitOpsConfig} */ (setting.meta);
};

const patchStoredMeta = async (patch) => {
	const current = await getStoredConfig();
	await settingModel
		.query()
		.where("id", "gitops-config")
		.patch({ meta: { ...current, ...patch } });
};

const normalizeConfig = (config, requireCredentials = false) => {
	const repositoryUrl = validateRepositoryUrl(config.repository_url);
	const branch = validateBranch(config.branch || "main");
	if (config.auth_type !== "https") throw new TypeError("GitOps authentication must be HTTPS/PAT");
	let credentials = "";
	if (config.encrypted_credentials) credentials = decrypt(config.encrypted_credentials);
	if (requireCredentials && !credentials) throw new TypeError("A Personal Access Token is required");
	if (
		credentials.length > 4096 ||
		[...credentials].some((character) => [0, 10, 13].includes(character.charCodeAt(0)))
	) {
		throw new TypeError("Invalid Personal Access Token");
	}
	return { repositoryUrl, branch, credentials };
};

const getGitAuth = (credentials) => ({
	onAuth: () => ({ username: "git", password: credentials }),
	onAuthFailure: () => {
		throw new errs.AuthError("Git repository rejected the configured Personal Access Token");
	},
});

const cloneRemote = async (config, depth = 1) => {
	const { repositoryUrl, branch, credentials } = normalizeConfig(config, true);
	await ensureDir();
	const directory = await fs.promises.mkdtemp(path.join(GITOPS_DIR, ".remote-"));
	try {
		await git.clone({
			fs,
			http: /** @type {any} */ (createSecureGitHttp(repositoryUrl)),
			dir: directory,
			url: repositoryUrl.toString(),
			remote: "origin",
			ref: branch,
			singleBranch: true,
			depth: Math.min(Math.max(depth, 1), MAX_HISTORY),
			noTags: true,
			...getGitAuth(credentials),
		});
		const remotes = await git.listRemotes({ fs, dir: directory });
		if (remotes.length !== 1 || remotes[0].remote !== "origin") throw new Error("Unexpected Git remote layout");
		const origin = validateRepositoryUrl(remotes[0].url);
		if (origin.toString() !== repositoryUrl.toString()) throw new Error("Git origin changed during clone");
		return { directory, branch, repositoryUrl, credentials };
	} catch (err) {
		await fs.promises.rm(directory, { recursive: true, force: true });
		throw err;
	}
};

const cleanMessage = (message) => {
	if (message === undefined || message === null || message === "") {
		return `ShieldPM public configuration snapshot - ${new Date().toISOString()}`;
	}
	if (typeof message !== "string") throw new TypeError("Commit message must be a string");
	const cleaned = [...message]
		.map((character) => {
			const code = character.charCodeAt(0);
			return code <= 31 || code === 127 ? " " : character;
		})
		.join("")
		.trim();
	if (!cleaned || cleaned.length > 200) throw new TypeError("Commit message must contain 1 to 200 characters");
	return cleaned;
};

const stageSnapshotOnly = async (directory) => {
	const matrix = await git.statusMatrix({ fs, dir: directory });
	let changed = false;
	for (const [filePath, head, workdir, stage] of matrix) {
		if (filePath !== CONFIG_SUBDIR && !filePath.startsWith(`${CONFIG_SUBDIR}/`)) {
			if (stage !== head) throw new Error(`Refusing a pre-staged path outside ${CONFIG_SUBDIR}`);
			continue;
		}
		if (workdir === 0) await git.remove({ fs, dir: directory, filepath: filePath });
		else await git.add({ fs, dir: directory, filepath: filePath });
		if (head !== workdir || head !== stage) changed = true;
	}
	return changed;
};

const getRuntimeDirectories = () =>
	RUNTIME_TYPES.map((kind) => ({ kind, target: path.dirname(internalNginx.getConfigName(kind, 1)) }));

const captureDatabaseBackup = async (artifacts, trx) => {
	const backup = {};
	const incoming = {};
	for (const [kind, spec] of Object.entries(MODEL_SPECS)) {
		let query = spec.model.query(trx).orderBy("id", "asc");
		if (spec.graph) query = query.withGraphFetched(spec.graph);
		const rows = await query;
		backup[kind] = rows.map((row) => ({
			...pickPublicFields(row, spec),
			owner_user_id: row.owner_user_id,
			is_deleted: Boolean(row.is_deleted),
		}));
		incoming[kind] = artifacts.filter((entry) => entry.kind === kind).map((entry) => entry.id);
	}
	return { backup, incoming };
};

const assertDatabaseBackup = (databaseBackup, incoming) => {
	if (!databaseBackup || !incoming) throw new TypeError("Missing GitOps database recovery state");
	let rowCount = 0;
	for (const [kind, spec] of Object.entries(MODEL_SPECS)) {
		if (!Array.isArray(databaseBackup[kind]) || !Array.isArray(incoming[kind])) {
			throw new TypeError(`Invalid GitOps recovery state for ${kind}`);
		}
		for (const row of databaseBackup[kind]) {
			rowCount++;
			const publicData = Object.fromEntries(
				spec.fields.filter((field) => row[field] !== undefined).map((field) => [field, row[field]]),
			);
			const allowedKeys = new Set([...spec.fields, "owner_user_id", "is_deleted"]);
			if (
				!spec.validate(publicData) ||
				Object.keys(row).some((key) => !allowedKeys.has(key)) ||
				!Number.isInteger(row.owner_user_id) ||
				row.owner_user_id < 1 ||
				typeof row.is_deleted !== "boolean"
			) {
				throw new TypeError(`Invalid GitOps database backup row for ${kind}`);
			}
		}
		if (incoming[kind].some((id) => !Number.isInteger(id) || id < 1)) {
			throw new TypeError(`Invalid GitOps incoming identifiers for ${kind}`);
		}
		if (new Set(incoming[kind]).size !== incoming[kind].length) {
			throw new TypeError(`Duplicate GitOps incoming identifiers for ${kind}`);
		}
	}
	if (rowCount > MAX_DATABASE_BACKUP_ROWS) throw new RangeError("GitOps database recovery row limit exceeded");
	if (Buffer.byteLength(JSON.stringify({ databaseBackup, incoming })) > MAX_DATABASE_BACKUP_BYTES) {
		throw new RangeError("GitOps database recovery state exceeds the size limit");
	}
};

const restoreDatabaseBackup = async (databaseBackup, incoming) => {
	assertDatabaseBackup(databaseBackup, incoming);
	await transaction(ProxyHost.knex(), async (trx) => {
		for (const [kind, spec] of Object.entries(MODEL_SPECS)) {
			const rows = databaseBackup?.[kind] || [];
			const priorIds = new Set(rows.map((row) => row.id));
			for (const row of rows) {
				const existing = await spec.model.query(trx).findById(row.id);
				if (existing) await spec.model.query(trx).patchAndFetchById(row.id, row);
				else await spec.model.query(trx).insert(row);
				if (kind === "proxy_host") await syncProxyDomains(trx, row.id, row.domain_names);
			}
			for (const id of incoming?.[kind] || []) {
				if (!priorIds.has(id)) await spec.model.query(trx).deleteById(id);
			}
		}
	});
};

const inspectDirectory = async (directory, label) => {
	try {
		const stats = await fs.promises.lstat(directory);
		if (stats.isSymbolicLink() || !stats.isDirectory()) {
			throw new Error(`${label} is not a real directory`);
		}
		return true;
	} catch (err) {
		if (err.code === "ENOENT") return false;
		throw err;
	}
};

const restoreRuntimeDirectories = async (directories) => {
	const errors = [];
	for (const { target, backup, had_target: hadTarget } of directories || []) {
		try {
			const backupExists = await inspectDirectory(backup, "GitOps runtime backup");
			if (backupExists) {
				await fs.promises.rm(target, { recursive: true, force: true });
				await fs.promises.rename(backup, target);
			} else if (hadTarget) {
				if (!(await inspectDirectory(target, "GitOps original runtime directory"))) {
					throw new Error("GitOps runtime backup required for recovery is missing");
				}
			} else {
				await fs.promises.rm(target, { recursive: true, force: true });
			}
			await fsyncDirectory(path.dirname(target));
		} catch (err) {
			errors.push(`${target}: ${err.message}`);
		}
	}
	return errors;
};

const recoverRuntimeJournal = async (journal) => {
	const expectedByTarget = new Map(getRuntimeDirectories().map(({ kind, target }) => [target, kind]));
	if (
		!["prepared", "db-committing", "db-committed", "runtime-committed"].includes(journal?.phase) ||
		!Array.isArray(journal.directories) ||
		journal.directories.length !== expectedByTarget.size ||
		new Set(journal.directories.map((directory) => directory?.target)).size !== expectedByTarget.size ||
		journal.directories.some(
			(directory) =>
				!expectedByTarget.has(directory?.target) ||
				directory.kind !== expectedByTarget.get(directory.target) ||
				typeof directory.backup !== "string" ||
				typeof directory.had_target !== "boolean" ||
				path.dirname(directory.backup) !== path.dirname(directory.target) ||
				!path.basename(directory.backup).startsWith(`${path.basename(directory.target)}.gitops-backup-`),
		)
	) {
		throw new Error("Refusing malformed GitOps runtime recovery journal");
	}
	const errors = [];
	if (journal.phase === "runtime-committed") {
		for (const { backup } of journal.directories) {
			try {
				await fs.promises.rm(backup, { recursive: true, force: true });
			} catch (err) {
				errors.push(`${backup}: ${err.message}`);
			}
		}
		if (errors.length) throw new Error(`GitOps committed cleanup failed: ${errors.join("; ")}`);
		await clearJournal();
		logger.warn("GitOps completed cleanup for a committed database/runtime import");
		return;
	}
	if (["db-committing", "db-committed"].includes(journal.phase)) {
		try {
			await restoreDatabaseBackup(journal.database_backup, journal.incoming);
		} catch (err) {
			errors.push(`database: ${err.message}`);
		}
	}
	errors.push(...(await restoreRuntimeDirectories(journal.directories)));
	if (journal.phase === "db-committed") {
		try {
			await internalNginx.test();
			await internalNginx.reload();
		} catch (err) {
			errors.push(`Nginx recovery: ${err.message}`);
		}
	}
	if (errors.length) throw new Error(`GitOps crash recovery failed: ${errors.join("; ")}`);
	await clearJournal();
	logger.warn("GitOps recovered an interrupted database/runtime import before any Nginx reload");
};

const stageRuntimeDirectories = async (databaseState) => {
	await recoverSnapshotJournal();
	const operationId = `${process.pid}-${Date.now()}`;
	const directories = [];
	for (const { kind, target } of getRuntimeDirectories()) {
		const backup = `${target}.gitops-backup-${operationId}`;
		if (await inspectDirectory(backup, "GitOps runtime backup")) {
			throw new Error("Refusing to overwrite an existing GitOps runtime backup");
		}
		directories.push({
			kind,
			target,
			backup,
			had_target: await inspectDirectory(target, "GitOps runtime target"),
		});
	}
	await writeJournal({ kind: "runtime-stage", phase: "prepared", directories, ...databaseState });
	try {
		for (const directory of directories) {
			await fs.promises.mkdir(path.dirname(directory.target), { recursive: true, mode: 0o750 });
			if (directory.had_target) {
				await fs.promises.rename(directory.target, directory.backup);
			}
			await fs.promises.mkdir(directory.target, { recursive: false, mode: 0o750 });
			await fsyncDirectory(path.dirname(directory.target));
		}
		return directories;
	} catch (err) {
		const rollbackErrors = await restoreRuntimeDirectories(directories);
		if (!rollbackErrors.length)
			await clearJournal().catch((journalError) => rollbackErrors.push(journalError.message));
		if (rollbackErrors.length) {
			err.message = `${err.message}; runtime rollback failed: ${rollbackErrors.join("; ")}`;
		}
		throw err;
	}
};

const commitRuntimeDirectories = async (directories, databaseState) => {
	await writeJournal({ kind: "runtime-stage", phase: "runtime-committed", directories, ...databaseState });
	const cleanupErrors = [];
	for (const { backup } of directories) {
		try {
			await fs.promises.rm(backup, { recursive: true, force: true });
		} catch (err) {
			cleanupErrors.push(`${backup}: ${err.message}`);
		}
	}
	if (cleanupErrors.length) {
		logger.warn(`GitOps committed with deferred runtime cleanup: ${cleanupErrors.join("; ")}`);
		return;
	}
	await clearJournal().catch((err) => {
		logger.warn(`GitOps committed with deferred journal cleanup: ${err.message}`);
	});
};

const fetchCandidates = async (trx) => {
	const candidates = {};
	for (const [kind, spec] of Object.entries(MODEL_SPECS)) {
		let query = spec.model.query(trx).where("is_deleted", 0).orderBy("id", "asc");
		if (spec.graph) query = query.withGraphFetched(spec.graph);
		candidates[kind] = await query;
	}
	return candidates;
};

const generateCandidateRuntime = async (candidates) => {
	for (const [kind, rows] of Object.entries(candidates)) {
		for (const row of rows) await internalNginx.generateConfig(kind, row);
	}
	await internalNginx.test();
};

const syncProxyDomains = async (trx, proxyHostId, domainNames) => {
	await HostDomain.query(trx).delete().where("proxy_host_id", proxyHostId);
	if (domainNames?.length) {
		await HostDomain.query(trx).insert(
			domainNames.map((domainName) => ({ proxy_host_id: proxyHostId, domain_name: domainName })),
		);
	}
};

const applyArtifacts = async (trx, artifacts, options, ownerUserId) => {
	let imported = 0;
	let skipped = 0;
	let deleted = 0;
	for (const [kind, spec] of Object.entries(MODEL_SPECS)) {
		const kindArtifacts = artifacts.filter((entry) => entry.kind === kind);
		const importedIds = new Set();
		for (const artifact of kindArtifacts) {
			const payload = structuredClone(artifact.data);
			const existing = await spec.model.query(trx).findById(payload.id);
			if (kind === "proxy_host" && payload.forward_scheme === "terminal" && !existing) {
				// Terminal credentials are deliberately absent from the public
				// projection. An existing terminal can retain its local credentials,
				// but a new one cannot be reconstructed safely from Git.
				skipped++;
				importedIds.add(payload.id);
				continue;
			}
			if (existing && !options.overwrite) {
				skipped++;
				importedIds.add(payload.id);
				continue;
			}
			payload.is_deleted = 0;
			if (existing) {
				delete payload.owner_user_id;
				await spec.model.query(trx).patchAndFetchById(payload.id, payload);
			} else {
				payload.owner_user_id = ownerUserId;
				await spec.model.query(trx).insert(payload);
			}
			if (kind === "proxy_host") await syncProxyDomains(trx, payload.id, payload.domain_names);
			importedIds.add(payload.id);
			imported++;
		}

		if (options.overwrite) {
			const activeRows = await spec.model.query(trx).where("is_deleted", 0);
			for (const row of activeRows) {
				if (!importedIds.has(row.id)) {
					await spec.model.query(trx).patchAndFetchById(row.id, { is_deleted: 1 });
					deleted++;
				}
			}
		}
	}
	return { imported, skipped, deleted };
};

const importSnapshot = async (access, options = {}) => {
	await recoverSnapshotJournal();
	const snapshot = await loadSnapshot(getConfigDir());
	const normalizedOptions = { overwrite: options.overwrite === true, dryRun: options.dryRun === true };
	const ownerUserId = access.token.getUserId(1);
	if (!Number.isInteger(ownerUserId) || ownerUserId < 1)
		throw new errs.PermissionError("Invalid GitOps owner context");
	let recoveryState;
	let runtimeDirectories = [];
	let counts;
	let reloadAttempted = false;
	const dryRunRollback = Symbol("gitops-dry-run");

	try {
		try {
			await transaction(ProxyHost.knex(), async (trx) => {
				const databaseState = await captureDatabaseBackup(snapshot.artifacts, trx);
				assertDatabaseBackup(databaseState.backup, databaseState.incoming);
				recoveryState = {
					database_backup: databaseState.backup,
					incoming: databaseState.incoming,
				};
				runtimeDirectories = await stageRuntimeDirectories(recoveryState);
				if (!normalizedOptions.dryRun) {
					await writeJournal({
						kind: "runtime-stage",
						phase: "db-committing",
						directories: runtimeDirectories,
						...recoveryState,
					});
				}
				counts = await applyArtifacts(trx, snapshot.artifacts, normalizedOptions, ownerUserId);
				await generateCandidateRuntime(await fetchCandidates(trx));
				if (normalizedOptions.dryRun) throw dryRunRollback;
			});
		} catch (err) {
			if (err !== dryRunRollback) throw err;
		}

		if (normalizedOptions.dryRun) {
			const rollbackErrors = await restoreRuntimeDirectories(runtimeDirectories);
			if (!rollbackErrors.length) {
				await clearJournal().catch((err) => rollbackErrors.push(`journal: ${err.message}`));
			}
			if (rollbackErrors.length) {
				throw new Error(`Dry-run rollback failed: ${rollbackErrors.join("; ")}`);
			}
			return { success: true, dry_run: true, ...counts, errors: [] };
		}

		await writeJournal({
			kind: "runtime-stage",
			phase: "db-committed",
			directories: runtimeDirectories,
			...recoveryState,
		});
		reloadAttempted = true;
		await internalNginx.reload();
		await commitRuntimeDirectories(runtimeDirectories, recoveryState);
		await internalAuditLog
			.add(access, {
				action: "imported",
				object_type: "gitops-snapshot",
				object_id: 0,
				meta: { overwrite: normalizedOptions.overwrite, ...counts },
			})
			.catch((auditError) => logger.warn(`GitOps import audit logging failed: ${safeErrorMessage(auditError)}`));
		return { success: true, dry_run: false, ...counts, errors: [] };
	} catch (err) {
		const rollbackErrors = [];
		if (!normalizedOptions.dryRun && recoveryState) {
			try {
				await restoreDatabaseBackup(recoveryState.database_backup, recoveryState.incoming);
			} catch (rollbackError) {
				rollbackErrors.push(`database: ${rollbackError.message}`);
			}
		}
		rollbackErrors.push(...(await restoreRuntimeDirectories(runtimeDirectories)));
		if (reloadAttempted) {
			try {
				await internalNginx.test();
				await internalNginx.reload();
			} catch (rollbackError) {
				rollbackErrors.push(`Nginx recovery: ${rollbackError.message}`);
			}
		}
		if (!rollbackErrors.length && runtimeDirectories.length) {
			await clearJournal().catch((journalError) => rollbackErrors.push(`journal: ${journalError.message}`));
		}
		return {
			success: false,
			dry_run: normalizedOptions.dryRun,
			imported: counts?.imported || 0,
			skipped: counts?.skipped || 0,
			deleted: counts?.deleted || 0,
			errors: [safeErrorMessage(err), ...rollbackErrors].slice(0, 20),
		};
	}
};

const SAFE_IMPORT_FIELDS = Object.fromEntries(
	Object.values(MODEL_SPECS).map((spec) => [spec.model.name, [...spec.fields]]),
);

const sanitizeImportData = (modelName, data) => {
	const fields = SAFE_IMPORT_FIELDS[modelName];
	if (!fields || !data || typeof data !== "object" || Array.isArray(data)) return null;
	if (Object.keys(data).some((key) => !fields.includes(key))) return null;
	const result = structuredClone(data);
	return containsSecretMaterial(result) ? null : result;
};

const safeErrorMessage = (err, credentials = "") => {
	let message = err instanceof Error ? err.message : "Unknown error";
	if (credentials) message = message.split(credentials).join("[REDACTED]");
	return message.replace(/https:\/\/[^\s/@]+:[^\s/@]+@/gi, "https://[REDACTED]@").slice(0, 2000);
};

const requirePermission = async (access) => {
	if (!access) return;
	await access.can("settings:update", "gitops-config");
};

const internalGitOps = {
	/**
	 * Return only the public GitOps configuration projection.
	 *
	 * @returns {Promise<Object>}
	 */
	getConfig: async () => {
		const config = await getStoredConfig();
		return {
			enabled: Boolean(config.enabled),
			repository_url: config.repository_url || "",
			branch: config.branch || "main",
			auth_type: "https",
			has_credentials: Boolean(config.encrypted_credentials),
			auto_push: Boolean(config.auto_push),
			auto_pull_on_startup: Boolean(config.auto_pull_on_startup),
			last_sync: config.last_sync || null,
			last_error: config.last_error || null,
		};
	},

	/** @returns {Promise<GitOpsConfig>} */
	getConfigInternal: getStoredConfig,

	/**
	 * @param {Access} access
	 * @param {Object} data
	 * @returns {Promise<Object>}
	 */
	updateConfig: async (access, data) => {
		if (isDemoMode()) throw new errs.AuthError("GitOps is disabled in Demo Mode");
		await requirePermission(access);
		if (!data || typeof data !== "object" || Array.isArray(data))
			throw new TypeError("Invalid GitOps configuration");
		const allowed = new Set([
			"enabled",
			"repository_url",
			"branch",
			"auth_type",
			"credentials",
			"auto_push",
			"auto_pull_on_startup",
		]);
		if (Object.keys(data).some((key) => !allowed.has(key)))
			throw new TypeError("Unknown GitOps configuration field");

		const currentSetting = await settingModel.query().where("id", "gitops-config").first();
		if (!currentSetting) throw new errs.ItemNotFoundError("gitops-config");
		const next = { ...currentSetting.meta, auth_type: "https" };
		if (data.enabled !== undefined) {
			if (typeof data.enabled !== "boolean") throw new TypeError("enabled must be boolean");
			next.enabled = data.enabled;
		}
		if (data.repository_url !== undefined) {
			next.repository_url = data.repository_url ? validateRepositoryUrl(data.repository_url).toString() : "";
		}
		if (data.branch !== undefined) next.branch = validateBranch(data.branch);
		if (data.auth_type !== undefined && data.auth_type !== "https") {
			throw new TypeError("GitOps supports HTTPS/PAT authentication only");
		}
		for (const field of ["auto_push", "auto_pull_on_startup"]) {
			if (data[field] !== undefined) {
				if (typeof data[field] !== "boolean") throw new TypeError(`${field} must be boolean`);
				next[field] = data[field];
			}
		}
		if (data.credentials !== undefined) {
			if (
				typeof data.credentials !== "string" ||
				data.credentials.length > 4096 ||
				[...data.credentials].some((character) => [0, 10, 13].includes(character.charCodeAt(0)))
			) {
				throw new TypeError("Invalid Personal Access Token");
			}
			next.encrypted_credentials = data.credentials ? encrypt(data.credentials) : "";
		}
		if (next.enabled) normalizeConfig(next, true);

		await settingModel
			.query()
			.where("id", "gitops-config")
			.patch({
				value: next.enabled ? "enabled" : "disabled",
				meta: next,
			});
		logger.info("GitOps public configuration updated");
		return internalGitOps.getConfig();
	},

	/** Recover interrupted filesystem state before any operation can reload Nginx. */
	initRepo: async () => {
		await ensureDir();
		await recoverSnapshotJournal();
	},

	/**
	 * @param {Access} [access]
	 * @returns {Promise<{success:boolean,message:string}>}
	 */
	testConnection: async (access) => {
		if (isDemoMode()) throw new errs.AuthError("GitOps is disabled in Demo Mode");
		await requirePermission(access);
		return withLock(async () => {
			const config = await getStoredConfig();
			let clone;
			let credentials = "";
			try {
				credentials = normalizeConfig(config, true).credentials;
				clone = await cloneRemote(config, 1);
				return { success: true, message: `Connected securely to origin/${clone.branch}` };
			} catch (err) {
				const message = safeErrorMessage(err, credentials);
				logger.warn(`GitOps connection test failed: ${message}`);
				return { success: false, message };
			} finally {
				if (clone) await fs.promises.rm(clone.directory, { recursive: true, force: true });
			}
		});
	},

	/**
	 * @param {Access} [access]
	 * @returns {Promise<string[]>}
	 */
	exportConfig: async (access) => {
		if (isDemoMode()) throw new errs.AuthError("GitOps is disabled in Demo Mode");
		await requirePermission(access);
		return withLock(async () => {
			const { temporaryRoot, manifest } = await createSnapshot();
			try {
				await installSnapshot(temporaryRoot);
				logger.info(`GitOps exported ${manifest.files.length} public configuration artifacts`);
				return manifest.files.map((file) => path.join(getConfigDir(), file.path));
			} finally {
				await fs.promises.rm(temporaryRoot, { recursive: true, force: true });
			}
		});
	},

	/**
	 * @param {Access|string} [accessOrMessage]
	 * @param {string} [optionalMessage]
	 * @returns {Promise<{success:boolean,commit?:string,message?:string}>}
	 */
	commitAndPush: async (accessOrMessage, optionalMessage) => {
		if (isDemoMode()) throw new errs.AuthError("GitOps is disabled in Demo Mode");
		const access = typeof accessOrMessage === "object" ? accessOrMessage : undefined;
		const message = typeof accessOrMessage === "string" ? accessOrMessage : optionalMessage;
		await requirePermission(access);
		return withLock(async () => {
			const config = await getStoredConfig();
			if (!config.enabled) return { success: false, message: "GitOps is not enabled" };
			let clone;
			let credentials = "";
			try {
				credentials = normalizeConfig(config, true).credentials;
				await loadSnapshot(getConfigDir());
				clone = await cloneRemote(config, 1);
				const remoteSnapshot = path.join(clone.directory, CONFIG_SUBDIR);
				await fs.promises.rm(remoteSnapshot, { recursive: true, force: true });
				await copyVerifiedSnapshot(getConfigDir(), remoteSnapshot);
				if (!(await stageSnapshotOnly(clone.directory))) {
					return { success: true, message: "No public configuration changes to commit" };
				}
				const sha = await git.commit({
					fs,
					dir: clone.directory,
					message: cleanMessage(message),
					author: { name: "ShieldPM GitOps", email: "gitops@shieldpm.local" },
				});
				await git.push({
					fs,
					http: /** @type {any} */ (createSecureGitHttp(clone.repositoryUrl)),
					dir: clone.directory,
					remote: "origin",
					ref: clone.branch,
					force: false,
					...getGitAuth(clone.credentials),
				});
				await patchStoredMeta({ last_sync: new Date().toISOString(), last_error: null });
				return { success: true, commit: sha };
			} catch (err) {
				const errorMessage = safeErrorMessage(err, credentials);
				logger.error(`GitOps push failed: ${errorMessage}`);
				await patchStoredMeta({ last_error: errorMessage }).catch(() => {});
				return { success: false, message: errorMessage };
			} finally {
				if (clone) await fs.promises.rm(clone.directory, { recursive: true, force: true });
			}
		});
	},

	/**
	 * @param {Access} [access]
	 * @returns {Promise<{success:boolean,message:string}>}
	 */
	pull: async (access) => {
		if (isDemoMode()) throw new errs.AuthError("GitOps is disabled in Demo Mode");
		await requirePermission(access);
		return withLock(async () => {
			const config = await getStoredConfig();
			if (!config.enabled) return { success: false, message: "GitOps is not enabled" };
			let clone;
			let credentials = "";
			try {
				credentials = normalizeConfig(config, true).credentials;
				clone = await cloneRemote(config, 1);
				const remoteSnapshot = path.join(clone.directory, CONFIG_SUBDIR);
				await loadSnapshot(remoteSnapshot);
				await installSnapshot(remoteSnapshot);
				await patchStoredMeta({ last_sync: new Date().toISOString(), last_error: null });
				return { success: true, message: "Verified snapshot pulled from origin" };
			} catch (err) {
				const message = safeErrorMessage(err, credentials);
				logger.error(`GitOps pull failed: ${message}`);
				await patchStoredMeta({ last_error: message }).catch(() => {});
				return { success: false, message };
			} finally {
				if (clone) await fs.promises.rm(clone.directory, { recursive: true, force: true });
			}
		});
	},

	/**
	 * @param {Access|number} [accessOrLimit]
	 * @param {number} [optionalLimit]
	 * @returns {Promise<Array>}
	 */
	getHistory: async (accessOrLimit = 20, optionalLimit = 20) => {
		const access = typeof accessOrLimit === "object" ? accessOrLimit : undefined;
		const requestedLimit = typeof accessOrLimit === "number" ? accessOrLimit : optionalLimit;
		await requirePermission(access);
		const limit = Math.min(Math.max(Number.parseInt(String(requestedLimit), 10) || 20, 1), MAX_HISTORY);
		return withLock(async () => {
			let clone;
			try {
				clone = await cloneRemote(await getStoredConfig(), limit);
				const commits = await git.log({ fs, dir: clone.directory, ref: clone.branch, depth: limit });
				return commits.map((commit) => ({
					sha: commit.oid,
					message: commit.commit.message.slice(0, 500),
					author: commit.commit.author.name.slice(0, 200),
					date: new Date(commit.commit.author.timestamp * 1000).toISOString(),
				}));
			} catch (err) {
				logger.warn(`GitOps history unavailable: ${safeErrorMessage(err)}`);
				return [];
			} finally {
				if (clone) await fs.promises.rm(clone.directory, { recursive: true, force: true });
			}
		});
	},

	/**
	 * @param {Access} access
	 * @param {string} commitSha
	 * @returns {Promise<Object>}
	 */
	revertToCommit: async (access, commitSha) => {
		await requirePermission(access);
		if (isDemoMode()) throw new errs.AuthError("GitOps is disabled in Demo Mode");
		if (typeof commitSha !== "string" || !/^[a-f0-9]{40}$/i.test(commitSha)) {
			throw new TypeError("A full 40-character commit SHA is required");
		}
		return withLock(async () => {
			let clone;
			try {
				clone = await cloneRemote(await getStoredConfig(), MAX_HISTORY);
				const history = await git.log({ fs, dir: clone.directory, ref: clone.branch, depth: MAX_HISTORY });
				if (!history.some((entry) => entry.oid === commitSha))
					throw new Error("Commit is outside bounded origin history");
				await git.checkout({ fs, dir: clone.directory, ref: commitSha });
				const source = path.join(clone.directory, CONFIG_SUBDIR);
				await loadSnapshot(source);
				await installSnapshot(source);
				const imported = await importSnapshot(access, { overwrite: true, dryRun: false });
				return imported.success
					? { ...imported, message: `Restored verified snapshot ${commitSha}` }
					: { ...imported, message: `Snapshot selected but import failed for ${commitSha}` };
			} catch (err) {
				return {
					success: false,
					message: safeErrorMessage(err),
					imported: 0,
					skipped: 0,
					deleted: 0,
					errors: [safeErrorMessage(err)],
				};
			} finally {
				if (clone) await fs.promises.rm(clone.directory, { recursive: true, force: true });
			}
		});
	},

	/**
	 * @param {Access} access
	 * @param {{overwrite?:boolean,dryRun?:boolean}} [options]
	 * @returns {Promise<Object>}
	 */
	importConfig: async (access, options = {}) => {
		if (isDemoMode()) throw new errs.AuthError("GitOps is disabled in Demo Mode");
		await requirePermission(access);
		return withLock(() => importSnapshot(access, options));
	},

	/** Initialize crash recovery and optional verified pull. */
	init: async () => {
		try {
			await withLock(async () => {
				await ensureDir();
				await recoverSnapshotJournal();
			});
			const config = await getStoredConfig();
			if (config.enabled && config.auto_pull_on_startup && config.repository_url) await internalGitOps.pull();
		} catch (err) {
			logger.error(`GitOps initialization failed closed: ${safeErrorMessage(err)}`);
		}
	},

	_autoPushTimer: null,

	/** @param {string} [changeType] */
	triggerAutoPush: (changeType = "configuration") => {
		if (internalGitOps._autoPushTimer) clearTimeout(internalGitOps._autoPushTimer);
		internalGitOps._autoPushTimer = setTimeout(async () => {
			try {
				const config = await getStoredConfig();
				if (!config.enabled || !config.auto_push || !config.repository_url) return;
				await internalGitOps.exportConfig();
				const result = await internalGitOps.commitAndPush(
					`Auto-backup: ${String(changeType).slice(0, 100)} changed`,
				);
				if (!result.success) logger.warn(`GitOps auto-push failed: ${result.message}`);
			} catch (err) {
				logger.error(`GitOps auto-push failed: ${safeErrorMessage(err)}`);
			}
		}, 5000);
	},

	/** Stop pending background work during graceful shutdown. */
	stop: async () => {
		if (internalGitOps._autoPushTimer) {
			clearTimeout(internalGitOps._autoPushTimer);
			internalGitOps._autoPushTimer = null;
		}
		await operationTail;
	},

	ALLOWED_IMPORT_FIELDS: SAFE_IMPORT_FIELDS,
	sanitizeImportData,
	sanitizeForExport: (obj, excludeFields = []) => {
		const output = { ...obj };
		for (const field of excludeFields) delete output[field];
		return redactSecrets(output);
	},
	_validateRepositoryUrl: validateRepositoryUrl,
	_loadSnapshot: loadSnapshot,
};

export default internalGitOps;
