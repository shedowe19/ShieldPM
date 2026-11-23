#!/usr/bin/env node
/**
 * Re-encrypts every protected column with the active ShieldPM data key.
 *
 * Usage (inside the container, or with DATA_PATH and the database environment
 * variables pointing at the instance):
 *
 *   SHIELDPM_ENCRYPTION_KEY=<new> \
 *   SHIELDPM_ENCRYPTION_KEY_PREVIOUS=<old> \
 *   node backend/scripts/rotate-encryption-key.js --dry-run
 *   ... --yes
 *
 * Take a database backup first. The command is idempotent: values that already
 * use the active key are left alone, and a second run without a previous key
 * is a no-op. Remove SHIELDPM_ENCRYPTION_KEY_PREVIOUS and restart once the
 * report shows no remaining values on the previous key.
 */
import getDatabase from "../db.js";
import { decrypt, encrypt, isEncrypted, needsRotation } from "../lib/encryption.js";

const COLUMNS = [
	{ table: "proxy_host", column: "git_credentials" },
	{ table: "proxy_host", column: "terminal_password" },
	{ table: "proxy_host", column: "terminal_private_key" },
	{ table: "proxy_host_revision", column: "encrypted_snapshot" },
	{ table: "cloudflared_tunnel", column: "token" },
	{ table: "tor_onion", column: "private_key" },
	{ table: "wireguard_peer", column: "client_private_key" },
	{ table: "wireguard_peer", column: "preshared_key" },
	{ table: "chat_integration", column: "token" },
	{ table: "notification_target", column: "secret" },
	{ table: "user_2fa", column: "secret", where: { type: "totp" }, encryptPlaintext: true },
];

const JSON_COLUMNS = [
	{
		table: "setting",
		column: "meta",
		paths: ["api_key", "encrypted_credentials", "clientSecret"],
		encryptPlaintextPaths: ["clientSecret"],
	},
	{
		table: "user_2fa",
		column: "meta",
		where: { type: "duo" },
		paths: ["clientSecret"],
		encryptPlaintextPaths: ["clientSecret"],
	},
];

const parseJson = (value) => (typeof value === "string" ? JSON.parse(value) : value);

const encodeJson = (value) => JSON.stringify(value);

const rotateScalar = (value, { encryptPlaintext = false } = {}) => {
	if (typeof value !== "string" || value === "" || value === "********") {
		return { changed: false, value };
	}
	if (needsRotation(value)) {
		return { changed: true, value: encrypt(decrypt(value)) };
	}
	if (encryptPlaintext && !isEncrypted(value)) {
		return { changed: true, value: encrypt(value) };
	}
	return { changed: false, value };
};

const rotateJson = (value, entry) => {
	if (value === null || value === undefined) return { changed: false, value };
	let parsed;
	try {
		parsed = parseJson(value);
	} catch {
		throw new Error(`Invalid JSON in ${entry.table}.${entry.column}`);
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return { changed: false, value };
	}

	let changed = false;
	const result = { ...parsed };
	for (const path of entry.paths) {
		const current = result[path];
		const rotated = rotateScalar(current, {
			encryptPlaintext: entry.encryptPlaintextPaths?.includes(path) ?? false,
		});
		if (rotated.changed) {
			result[path] = rotated.value;
			changed = true;
		}
	}
	return { changed, value: changed ? encodeJson(result) : value };
};

const countRemaining = (value, entry) => {
	if (typeof value !== "string" || value === "" || value === "********") return 0;
	if (needsRotation(value)) return 1;
	if (entry?.encryptPlaintext && !isEncrypted(value)) return 1;
	return 0;
};

const main = async () => {
	const dryRun = process.argv.includes("--dry-run");
	const confirmed = process.argv.includes("--yes");
	if (!process.env.SHIELDPM_ENCRYPTION_KEY_PREVIOUS?.trim()) {
		console.error("Set SHIELDPM_ENCRYPTION_KEY_PREVIOUS to the key that encrypted the existing values.");
		process.exit(1);
	}
	if (!dryRun && !confirmed) {
		console.error("Refusing to write without --yes. Run with --dry-run first and take a database backup.");
		process.exit(1);
	}

	const database = getDatabase();
	let rowsTouched = 0;
	let valuesRotated = 0;
	let remaining = 0;

	const processTable = async (trx, entry, isJson) => {
		if (!(await trx.schema.hasTable(entry.table))) {
			console.warn(`- ${entry.table}: table not found, skipped`);
			return;
		}
		if (!(await trx.schema.hasColumn(entry.table, entry.column))) {
			console.warn(`- ${entry.table}.${entry.column}: column not found, skipped`);
			return;
		}
		const query = trx(entry.table).select("id", entry.column);
		if (entry.where) query.where(entry.where);
		const rows = await query;

		for (const row of rows) {
			const result = isJson ? rotateJson(row[entry.column], entry) : rotateScalar(row[entry.column], entry);
			if (result.changed) {
				valuesRotated += 1;
				rowsTouched += 1;
				if (!dryRun) {
					await trx(entry.table)
						.where({ id: row.id })
						.update({ [entry.column]: result.value });
				}
				console.log(`${dryRun ? "[dry-run] " : ""}${entry.table}.${entry.column} id=${row.id}`);
			}
			if (isJson) {
				const currentValue = result.changed ? result.value : row[entry.column];
				const parsed = parseJson(currentValue);
				if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
					for (const path of entry.paths) {
						remaining += countRemaining(parsed[path], {
							encryptPlaintext: entry.encryptPlaintextPaths?.includes(path) ?? false,
						});
					}
				}
			} else {
				remaining += countRemaining(result.changed ? result.value : row[entry.column], entry);
			}
		}
	};

	try {
		if (dryRun) {
			for (const entry of COLUMNS) await processTable(database, entry, false);
			for (const entry of JSON_COLUMNS) await processTable(database, entry, true);
		} else {
			await database.transaction(async (trx) => {
				for (const entry of COLUMNS) await processTable(trx, entry, false);
				for (const entry of JSON_COLUMNS) await processTable(trx, entry, true);
			});
		}
		console.log(
			`${dryRun ? "Would rotate" : "Rotated"} ${valuesRotated} value(s) in ${rowsTouched} row(s); ` +
				`${remaining} value(s) still need the previous key or initial encryption.`,
		);
	} finally {
		await database.destroy();
	}
};

main().catch((error) => {
	console.error(`Encryption key rotation failed: ${error.message}`);
	process.exitCode = 1;
});
