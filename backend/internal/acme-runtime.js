import { createPrivateKey } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";

const certbotRoot = "/data/tls/certbot";
const hasControlCharacters = (value) =>
	[...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const validAccount = (value) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);

/** @param {string} server @returns {URL} */
const parseServer = (server) => {
	try {
		const parsed = new URL(server);
		if (
			!/^https?:$/.test(parsed.protocol) ||
			parsed.username ||
			parsed.password ||
			parsed.hash ||
			/\s/.test(server) ||
			hasControlCharacters(server)
		) {
			throw new Error("invalid");
		}
		return parsed;
	} catch {
		throw new errs.ConfigurationError("The certificate's ACME server is invalid");
	}
};

/** @param {string} output @param {string[]} secrets @returns {string} */
export const redactAcmeOutput = (output, secrets) => {
	let safe = String(output ?? "");
	for (const secret of [...new Set(secrets.filter((value) => typeof value === "string" && value.length > 0))].sort(
		(a, b) => b.length - a.length,
	)) {
		for (const representation of new Set([
			secret,
			JSON.stringify(secret).slice(1, -1),
			encodeURIComponent(secret),
		])) {
			safe = safe.split(representation).join("[REDACTED]");
		}
	}
	return safe;
};

/** Read only issuer fields from the managed lineage; never infer an old issuer from current settings.
 * @param {{id:number,meta?:Object}} certificate
 * @param {string} [root]
 * @returns {Promise<{server:string,account:string|null}>}
 */
export const getCertificateIssuer = async (certificate, root = certbotRoot) => {
	if (!Number.isSafeInteger(certificate.id) || certificate.id < 1)
		throw new errs.ValidationError("Invalid certificate ID");
	const meta = /** @type {any} */ (certificate.meta || {});
	let content;
	try {
		content = await fs.promises.readFile(path.join(root, "renewal", `npm-${certificate.id}.conf`), "utf8");
	} catch {
		throw new errs.ConfigurationError(
			`The original ACME issuer for certificate ${certificate.id} could not be read`,
		);
	}
	const values = {};
	let inRenewal = false;
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed.startsWith("[")) {
			inRenewal = trimmed === "[renewalparams]";
			continue;
		}
		if (!inRenewal) continue;
		const match = trimmed.match(/^(server|account)\s*=\s*(.*?)\s*$/);
		if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
	}
	parseServer(values.server);
	if (values.account && !validAccount(values.account))
		throw new errs.ConfigurationError("The certificate's ACME account is invalid");
	if (meta.acme_server !== undefined || meta.acme_account !== undefined) {
		if (
			meta.acme_server !== values.server ||
			!validAccount(meta.acme_account) ||
			meta.acme_account !== values.account
		) {
			throw new errs.ConfigurationError(
				"The saved ACME issuer does not match the certificate's original lineage",
			);
		}
	}
	return { server: values.server, account: values.account || null };
};

/** Certbot keys accounts by netloc plus the directory's complete path.
 * @param {string} server @param {string} [root] @returns {string}
 */
export const getAccountDirectory = (server, root = certbotRoot) => {
	parseServer(server);
	// Python urlparse preserves authority casing and explicit default ports. Its path
	// excludes parameters on the last segment, unlike WHATWG URL.pathname.
	const raw = server.match(/^https?:\/\/([^/?#]+)([^?#]*)(?:\?[^#]*)?$/i);
	if (!raw || raw[1].includes("\\")) throw new errs.ConfigurationError("Invalid ACME account directory");
	let pathname = raw[2];
	const parameters = pathname.indexOf(";", pathname.lastIndexOf("/") + 1);
	if (parameters !== -1) pathname = pathname.slice(0, parameters);
	const directory = path.resolve(root, "accounts", `${raw[1]}${pathname}`);
	const accountsRoot = path.resolve(root, "accounts");
	if (!directory.startsWith(`${accountsRoot}${path.sep}`))
		throw new errs.ConfigurationError("Invalid ACME account directory");
	return directory;
};

/** @param {string} server @param {string} [root] @returns {Promise<string[]>} */
export const findAcmeAccounts = async (server, root = certbotRoot) => {
	const directory = getAccountDirectory(server, root);
	let entries;
	try {
		entries = await fs.promises.readdir(directory);
	} catch (err) {
		if (err.code === "ENOENT") return [];
		throw new errs.ConfigurationError("The ACME account directory could not be read");
	}
	const accounts = [];
	for (const id of entries) {
		if (!validAccount(id)) continue;
		try {
			const registration = JSON.parse(await fs.promises.readFile(path.join(directory, id, "regr.json"), "utf8"));
			const key = JSON.parse(await fs.promises.readFile(path.join(directory, id, "private_key.json"), "utf8"));
			if (createPrivateKey({ key, format: "jwk" }).type !== "private") continue;
			const metadata = JSON.parse(await fs.promises.readFile(path.join(directory, id, "meta.json"), "utf8"));
			if (
				typeof metadata.creation_host !== "string" ||
				typeof metadata.creation_dt !== "string" ||
				!Number.isFinite(Date.parse(metadata.creation_dt))
			)
				continue;
			const uri = new URL(registration.uri);
			if (
				/^https?:$/.test(uri.protocol) &&
				registration.body &&
				typeof registration.body === "object" &&
				!Array.isArray(registration.body) &&
				(registration.body.status === undefined || registration.body.status === "valid") &&
				(registration.body.contact === undefined ||
					(Array.isArray(registration.body.contact) &&
						registration.body.contact.every((contact) => typeof contact === "string")))
			)
				accounts.push(id);
		} catch {
			// Incomplete or invalid directories are not registered accounts.
		}
	}
	return accounts.sort();
};

/** Create an operation-owned config. No values from the old global INI are inherited.
 * @param {any} policy @param {string} server @param {{workRoot?:string}} [options]
 * @returns {Promise<{filename:string,secrets:string[],writeEab:Function,exec:Function,cleanup:Function}>}
 */
export const createAcmeConfig = async (policy, server, options = {}) => {
	parseServer(server);
	const workRoot = options.workRoot || "/data/certbot-work";
	await fs.promises.mkdir(workRoot, { recursive: true });
	const directory = await fs.promises.mkdtemp(path.join(workRoot, "shieldpm-operation-"));
	const filename = path.join(directory, "certbot.ini");
	const secrets = [policy.eab_hmac_key || "", policy.eab_kid || "", policy.email || ""];
	const base = [
		`logs-dir = ${path.join(directory, "logs")}`,
		"work-dir = /data/certbot-work",
		"config-dir = /data/tls/certbot",
		"webroot-path = /data/acme-challenge",
		"non-interactive = true",
		"no-random-sleep-on-renew = true",
		"no-eff-email = true",
		"new-key = true",
		"no-reuse-key = true",
		"rsa-key-size = 4096",
		"elliptic-curve = secp384r1",
		`agree-tos = ${policy.agree_tos === true}`,
		`must-staple = ${policy.must_staple === true}`,
		`no-verify-ssl = ${policy.server_tls_verify === false}`,
	];
	const writeEab = async (kid, hmac) => {
		if (
			typeof kid !== "string" ||
			!kid ||
			/[\s[\]"'#;]/.test(kid) ||
			hasControlCharacters(kid) ||
			typeof hmac !== "string" ||
			!/^[A-Za-z0-9_-]+={0,2}$/.test(hmac)
		)
			throw new errs.ConfigurationError("Invalid ACME account binding credentials");
		secrets.push(kid, hmac);
		await fs.promises.writeFile(
			filename,
			`${[...base, `eab-kid = ${kid}`, `eab-hmac-key = ${hmac}`].join("\n")}\n`,
			{ mode: 0o600 },
		);
		await fs.promises.chmod(filename, 0o600);
	};
	const cleanup = () => fs.promises.rm(directory, { force: true, recursive: true });
	try {
		await fs.promises.chmod(directory, 0o700);
		await fs.promises.writeFile(filename, `${base.join("\n")}\n`, { mode: 0o600 });
		await fs.promises.chmod(filename, 0o600);
	} catch (err) {
		await cleanup();
		throw err;
	}
	return {
		filename,
		secrets,
		writeEab,
		cleanup,
		exec: async (args) => {
			try {
				return redactAcmeOutput(await utils.execFile("certbot", ["--config", filename, ...args]), secrets);
			} catch (err) {
				throw new errs.CommandError(redactAcmeOutput(err.message, secrets), err.code || 1);
			}
		},
	};
};

/** Select/register the exact directory's account, then apply contact changes via update_account.
 * The caller owns the Certbot process lock.
 * @param {any} config @param {any} policy @param {{server:string,account:string|null}} issuer
 * @param {{root?:string,allowRegistration?:boolean}} [options]
 * @returns {Promise<string>}
 */
export const ensureAcmeAccount = async (config, policy, issuer, options = {}) => {
	const root = options.root || certbotRoot;
	let accounts = await findAcmeAccounts(issuer.server, root);
	let account = issuer.account || (options.allowRegistration !== false ? policy.account_id || null : null);
	if (account && !validAccount(account)) throw new errs.ConfigurationError("The selected ACME account is invalid");
	if (account && !accounts.includes(account))
		throw new errs.ConfigurationError("The certificate's original ACME account is missing");
	if (!account && accounts.length > 1)
		throw new errs.ConfigurationError(
			"Multiple accounts exist for this ACME directory; an account must be selected explicitly",
		);
	if (!account && accounts.length === 1) account = accounts[0];
	if (!account) {
		if (options.allowRegistration === false)
			throw new errs.ConfigurationError("The certificate's original ACME account is missing");
		if (!policy.agree_tos)
			throw new errs.ValidationError("Accept the ACME server's terms before registering a new account");
		let kid = policy.eab_kid;
		let hmac = policy.eab_hmac_key;
		if (parseServer(issuer.server).hostname === "acme.zerossl.com" && !kid && !hmac) {
			if (!policy.email)
				throw new errs.ValidationError("An email address is required for automatic ZeroSSL account binding");
			try {
				const credentials = JSON.parse(
					await utils.execFile("curl", [
						"--fail",
						"--silent",
						"--show-error",
						"--location",
						"--max-time",
						"30",
						"https://api.zerossl.com/acme/eab-credentials-email",
						"--data-urlencode",
						`email=${policy.email}`,
					]),
				);
				kid = credentials.eab_kid;
				hmac = credentials.eab_hmac_key;
				if (
					typeof kid !== "string" ||
					!kid ||
					/[\s[\]"'#;]/.test(kid) ||
					hasControlCharacters(kid) ||
					typeof hmac !== "string" ||
					!/^[A-Za-z0-9_-]+={0,2}$/.test(hmac)
				)
					throw new Error("invalid binding");
			} catch {
				throw new errs.ValidationError("Could not obtain ZeroSSL account binding credentials");
			}
		}
		if (kid || hmac) {
			if (!kid || !hmac) throw new errs.ConfigurationError("Both ACME account binding credentials are required");
			await config.writeEab(kid, hmac);
		}
		await config.exec([
			"register",
			"--server",
			issuer.server,
			...(policy.email ? ["--email", policy.email] : ["--register-unsafely-without-email"]),
		]);
		accounts = await findAcmeAccounts(issuer.server, root);
		if (accounts.length !== 1)
			throw new errs.ConfigurationError("The registered ACME account could not be determined");
		return accounts[0];
	}
	const directory = getAccountDirectory(issuer.server, root);
	const registration = JSON.parse(await fs.promises.readFile(path.join(directory, account, "regr.json"), "utf8"));
	const contacts = registration.body?.contact || [];
	const wanted = policy.email ? [`mailto:${policy.email}`] : [];
	if (JSON.stringify(contacts) !== JSON.stringify(wanted)) {
		await config.exec([
			"update_account",
			"--server",
			issuer.server,
			"--account",
			account,
			...(policy.email ? ["--email", policy.email] : ["--register-unsafely-without-email"]),
		]);
	}
	return account;
};
