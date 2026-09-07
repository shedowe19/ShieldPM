import fs from "node:fs";
import path from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import * as yaml from "js-yaml";
import _ from "lodash";
import { isDemoMode } from "../lib/config.js";
import { decrypt, encrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import { assertNoSymlinkPath, assertSafeConfigTree, writeConfigFile } from "../lib/gitops-files.js";
import { global as logger } from "../logger.js";
import AccessList from "../models/access_list.js";
import Certificate from "../models/certificate.js";
import CloudflaredTunnel from "../models/cloudflared_tunnel.js";
import DdnsProvider from "../models/ddns_provider.js";
import DeadHost from "../models/dead_host.js";
import ProxyHost from "../models/proxy_host.js";
import RedirectionHost from "../models/redirection_host.js";
import settingModel from "../models/setting.js";
import Stream from "../models/stream.js";
import User from "../models/user.js";
import internalNginx from "./nginx.js";

const GITOPS_DIR = "/data/gitops";
const CONFIG_SUBDIR = "shieldpm-config";

/**
 * Whitelist of allowed import fields per model.
 * Only fields listed here are imported from YAML; all others are ignored.
 * This prevents injection of arbitrary DB fields via malicious YAML content.
 */
const ALLOWED_IMPORT_FIELDS = {
	User: [
		"id",
		"is_disabled",
		"email",
		"name",
		"nickname",
		"avatar",
		"avatar_type",
		"avatar_value",
		"roles",
		"permissions",
		"is_deleted",
	],
	Certificate: ["id", "owner_user_id", "provider", "nice_name", "domain_names", "expires_on", "meta", "is_deleted"],
	AccessList: [
		"id",
		"owner_user_id",
		"name",
		"meta",
		"satisfy_any",
		"pass_auth",
		"is_deleted",
		"items",
		"clients",
		"mtls_enabled",
		"mtls_certificate",
		"mtls_use_internal",
	],
	ProxyHost: [
		"id",
		"owner_user_id",
		"domain_names",
		"forward_host",
		"forward_port",
		"access_list_id",
		"certificate_id",
		"ssl_forced",
		"caching_enabled",
		"block_exploits",
		"security_crowdsec",
		"anubis_enabled",
		"anubis_rules",
		"advanced_config",
		"bandwidth_limit",
		"forward_query",
		"meta",
		"note",
		"allow_websocket_upgrade",
		"http2_support",
		"forward_scheme",
		"enabled",
		"locations",
		"hsts_enabled",
		"hsts_subdomains",
		"maintenance_on_failure",
		"adv_limit_req_rate",
		"adv_limit_req_unit",
		"adv_limit_req_burst",
		"disable_buffering",
		"maintenance_active",
		"maintenance_start",
		"maintenance_end",
		"maintenance_reason",
		"php_enabled",
		"php_version",
		"php_override_ini",
		"index_file",
		"git_repo_url",
		"git_branch",
		"git_sync_enabled",
		"git_poll_interval",
		"git_poll_unit",
		"git_credentials",
		"git_last_sync",
		"git_last_commit",
		"git_last_error",
		"icon_url",
		"icon_type",
		"terminal_host",
		"terminal_port",
		"terminal_username",
		"terminal_auth_type",
		"terminal_password",
		"terminal_private_key",
		"turbo_loader",
		"is_deleted",
	],
	RedirectionHost: [
		"id",
		"owner_user_id",
		"domain_names",
		"forward_http_code",
		"forward_scheme",
		"forward_domain_name",
		"preserve_path",
		"certificate_id",
		"ssl_forced",
		"hsts_enabled",
		"hsts_subdomains",
		"http2_support",
		"block_exploits",
		"advanced_config",
		"enabled",
		"meta",
		"note",
		"is_deleted",
	],
	DeadHost: [
		"id",
		"owner_user_id",
		"domain_names",
		"certificate_id",
		"ssl_forced",
		"hsts_enabled",
		"hsts_subdomains",
		"http2_support",
		"advanced_config",
		"enabled",
		"meta",
		"note",
		"is_deleted",
	],
	Stream: [
		"id",
		"owner_user_id",
		"incoming_port",
		"forwarding_host",
		"forwarding_port",
		"tcp_forwarding",
		"udp_forwarding",
		"proxy_protocol_forwarding",
		"enabled",
		"certificate_id",
		"meta",
		"note",
		"is_deleted",
	],
	CloudflaredTunnel: ["id", "owner_user_id", "name", "token", "status", "meta", "is_deleted"],
	DdnsProvider: [
		"id",
		"owner_user_id",
		"name",
		"provider",
		"domains",
		"config",
		"last_ipv4",
		"last_ipv6",
		"last_updated_on",
		"last_error",
		"enabled",
		"meta",
		"ip_ver",
	],
	Setting: ["id", "name", "description", "value", "meta"],
};

/**
 * Sanitize data object by picking only allowed fields.
 * @param {string} modelName - Model name (key in ALLOWED_IMPORT_FIELDS)
 * @param {any} data - Raw data object from YAML
 * @returns {any} Sanitized object with only allowed fields
 */
const sanitizeImportData = (modelName, data) => {
	const allowed = ALLOWED_IMPORT_FIELDS[modelName];
	if (!allowed) {
		logger.warn(`GitOps: Unknown model "${modelName}" — skipping import.`);
		return null;
	}
	if (!data || typeof data !== "object" || Array.isArray(data)) return null;
	const result = _.pick(data, allowed);
	if (modelName === "User" && result.permissions) {
		result.permissions = _.pick(result.permissions, [
			"visibility",
			"proxy_hosts",
			"redirection_hosts",
			"dead_hosts",
			"streams",
			"access_lists",
			"certificates",
			"cloudflared_tunnels",
			"ddns_providers",
			"tor_onions",
			"wireguard_peers",
			"chat",
			"dashboard_notes",
			"analytics",
		]);
	}
	if (modelName === "AccessList") {
		for (const [relation, fields] of Object.entries({
			items: ["username", "password", "meta"],
			clients: ["address", "directive", "meta"],
		})) {
			if (Array.isArray(result[relation]))
				result[relation] = result[relation].map((item) => _.pick(item, fields));
		}
	}
	return result;
};

/**
 * @typedef {Object} GitOpsConfig
 * @property {boolean} enabled
 * @property {string} repository_url
 * @property {string} branch
 * @property {"ssh" | "https"} auth_type
 * @property {string} encrypted_credentials
 * @property {boolean} auto_push
 * @property {boolean} auto_pull_on_startup
 * @property {string|null} last_sync
 * @property {string|null} last_error
 */

/**
 * @typedef {Object} GitCommit
 * @property {string} sha
 * @property {string} message
 * @property {string} author
 * @property {string} date
 */

/**
 * Ensures the GitOps directory exists
 */
const ensureDir = async () => {
	if (!fs.existsSync(GITOPS_DIR)) {
		await fs.promises.mkdir(GITOPS_DIR, { recursive: true });
	}
};

/**
 * Gets the config subdirectory path
 * @returns {string}
 */
const getConfigDir = () => path.join(GITOPS_DIR, CONFIG_SUBDIR);

/**
 * Creates authentication object for git operations
 * @param {GitOpsConfig} config
 * @returns {Object}
 */
const getAuth = (config) => {
	if (!config.encrypted_credentials) {
		return {};
	}

	try {
		const credentials = decrypt(config.encrypted_credentials);

		if (config.auth_type === "https") {
			// Personal Access Token
			return {
				onAuth: () => ({
					username: "git",
					password: credentials,
				}),
			};
		}
		// SSH Key - isomorphic-git doesn't support SSH natively in Node,
		// but we can use HTTPS with tokens for GitHub/GitLab
		// For SSH, users should use HTTPS URLs with PAT instead
		return {
			onAuth: () => ({
				username: "git",
				password: credentials,
			}),
		};
	} catch (err) {
		logger.error("Failed to decrypt GitOps credentials:", err);
		return {};
	}
};

const internalGitOps = {
	/**
	 * Get GitOps configuration
	 * @returns {Promise<GitOpsConfig>}
	 */
	getConfig: async () => {
		const setting = await settingModel.query().where("id", "gitops-config").first();
		if (!setting) {
			throw new errs.ItemNotFoundError("gitops-config");
		}
		// Return config but never expose encrypted credentials
		const config = /** @type {GitOpsConfig} */ (setting.meta);
		return {
			...config,
			encrypted_credentials: config.encrypted_credentials ? "[REDACTED]" : "",
		};
	},

	/**
	 * Get GitOps configuration with credentials (internal use only)
	 * @returns {Promise<GitOpsConfig>}
	 */
	getConfigInternal: async () => {
		const setting = await settingModel.query().where("id", "gitops-config").first();
		if (!setting) {
			throw new errs.ItemNotFoundError("gitops-config");
		}
		return /** @type {GitOpsConfig} */ (setting.meta);
	},

	/**
	 * Update GitOps configuration
	 * @param {import("../lib/types.js").Access} access
	 * @param {Partial<GitOpsConfig> & {credentials?: string}} data
	 * @returns {Promise<GitOpsConfig>}
	 */
	updateConfig: async (access, data) => {
		if (isDemoMode()) {
			throw new errs.AuthError("GitOps is disabled in Demo Mode");
		}

		await access.can("settings:update", "gitops-config");

		const currentSetting = await settingModel.query().where("id", "gitops-config").first();
		if (!currentSetting) {
			throw new errs.ItemNotFoundError("gitops-config");
		}

		const currentConfig = /** @type {GitOpsConfig} */ (currentSetting.meta);
		const newConfig = { ...currentConfig };

		// Update fields
		if (data.enabled !== undefined) newConfig.enabled = data.enabled;
		if (data.repository_url !== undefined) newConfig.repository_url = data.repository_url;
		if (data.branch !== undefined) newConfig.branch = data.branch;
		if (data.auth_type !== undefined) newConfig.auth_type = data.auth_type;
		if (data.auto_push !== undefined) newConfig.auto_push = data.auto_push;
		if (data.auto_pull_on_startup !== undefined) newConfig.auto_pull_on_startup = data.auto_pull_on_startup;

		// Encrypt credentials if provided
		if (data.credentials) {
			newConfig.encrypted_credentials = encrypt(data.credentials);
		}

		await settingModel
			.query()
			.where("id", "gitops-config")
			.patch({
				value: newConfig.enabled ? "enabled" : "disabled",
				meta: newConfig,
			});

		logger.info("GitOps configuration updated");
		return internalGitOps.getConfig();
	},

	/**
	 * Initialize local git repository
	 * @returns {Promise<void>}
	 */
	initRepo: async () => {
		await ensureDir();
		const configDir = getConfigDir();

		if (!fs.existsSync(configDir)) {
			await fs.promises.mkdir(configDir, { recursive: true });
		}

		const gitDir = path.join(GITOPS_DIR, ".git");
		if (!fs.existsSync(gitDir)) {
			await git.init({ fs, dir: GITOPS_DIR, defaultBranch: "main" });
			logger.info("Initialized local GitOps repository");
		}
	},

	/**
	 * Test connection to remote repository
	 * @returns {Promise<{success: boolean, message: string}>}
	 */
	testConnection: async () => {
		if (isDemoMode()) {
			throw new errs.AuthError("GitOps is disabled in Demo Mode");
		}

		const config = await internalGitOps.getConfigInternal();

		if (!config.repository_url) {
			return { success: false, message: "Repository URL not configured" };
		}

		try {
			await internalGitOps.initRepo();

			// Try to fetch remote info (check valid auth)
			const info = await git.getRemoteInfo({
				http,
				url: config.repository_url,
				...getAuth(config),
			});

			// Check for visibility (try WITHOUT auth)
			let isPublic = false;
			try {
				await git.getRemoteInfo({
					http,
					url: config.repository_url,
				});
				isPublic = true;
			} catch (_err) {
				// Ignore error, it implies auth is required (as expected for private repos)
			}

			const result = {
				success: true,
				message: `Connected successfully. Default branch: ${info.HEAD || "unknown"}`,
			};

			if (isPublic) {
				result.warning = "WARNING: This repository appears to be PUBLIC! Please use a PRIVATE repository.";
			}

			return result;
		} catch (err) {
			logger.error("GitOps connection test failed:", err);
			return {
				success: false,
				message: err instanceof Error ? err.message : "Unknown error",
			};
		}
	},

	/**
	 * Export current configuration to YAML files
	 * @returns {Promise<string[]>} List of exported files
	 */
	exportConfig: async () => {
		if (isDemoMode()) {
			throw new errs.AuthError("GitOps is disabled in Demo Mode");
		}

		const configDir = getConfigDir();
		await assertSafeConfigTree(GITOPS_DIR, configDir);
		await internalGitOps.initRepo();
		const exportedFiles = [];

		// Create subdirectories
		const dirs = [
			"proxy-hosts",
			"redirection-hosts",
			"dead-hosts",
			"streams",
			"certificates",
			"users",
			"settings",
			"ddns-providers",
			"access-lists",
			"cloudflared-tunnels",
		];
		for (const dir of dirs) {
			const dirPath = path.join(configDir, dir);
			if (!fs.existsSync(dirPath)) {
				await assertNoSymlinkPath(GITOPS_DIR, dirPath);
				await fs.promises.mkdir(dirPath, { recursive: true });
			}
		}

		// Export Proxy Hosts
		const proxyHosts = await ProxyHost.query().where("is_deleted", 0).withGraphFetched("host_domains");
		for (const host of proxyHosts) {
			const filename = `${host.id}-${(host.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
			const filePath = path.join(configDir, "proxy-hosts", filename);
			const exportData = internalGitOps.sanitizeForExport(host, ["is_deleted"]);
			await writeConfigFile(GITOPS_DIR, filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}

		// Export Redirection Hosts
		const redirectionHosts = await RedirectionHost.query().where("is_deleted", 0);
		for (const host of redirectionHosts) {
			const filename = `${host.id}-${(host.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
			const filePath = path.join(configDir, "redirection-hosts", filename);
			const exportData = internalGitOps.sanitizeForExport(host, ["is_deleted"]);
			await writeConfigFile(GITOPS_DIR, filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}

		// Export Dead Hosts
		const deadHosts = await DeadHost.query().where("is_deleted", 0);
		for (const host of deadHosts) {
			const filename = `${host.id}-${(host.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
			const filePath = path.join(configDir, "dead-hosts", filename);
			const exportData = internalGitOps.sanitizeForExport(host, ["is_deleted"]);
			await writeConfigFile(GITOPS_DIR, filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}

		// Export Streams
		const streams = await Stream.query().where("is_deleted", 0);
		for (const stream of streams) {
			const filename = `${stream.id}-${stream.incoming_port || "unknown"}.yaml`;
			const filePath = path.join(configDir, "streams", filename);
			const exportData = internalGitOps.sanitizeForExport(stream, ["is_deleted"]);
			await writeConfigFile(GITOPS_DIR, filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}

		// Export Certificates (database entries only, not the actual cert files)
		const certificates = await Certificate.query().where("is_deleted", 0);
		for (const cert of certificates) {
			const filename = `${cert.id}-${(cert.nice_name || cert.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
			const filePath = path.join(configDir, "certificates", filename);
			const exportData = internalGitOps.sanitizeForExport(cert, ["is_deleted"]);
			await writeConfigFile(GITOPS_DIR, filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}

		// Export Users (with permissions, excluding password hashes for security)
		const users = await User.query().where("is_deleted", 0).withGraphFetched("permissions");
		for (const user of users) {
			const filename = `${user.id}-${(user.nickname || user.email || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
			const filePath = path.join(configDir, "users", filename);
			const exportData = internalGitOps.sanitizeForExport(user, ["is_deleted"]);
			await writeConfigFile(GITOPS_DIR, filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}

		// Export Settings (excluding gitops-config to avoid overwriting credentials)
		for (const [model, directory, graph] of [
			[AccessList, "access-lists", "[items,clients]"],
			[CloudflaredTunnel, "cloudflared-tunnels", null],
			[DdnsProvider, "ddns-providers", null],
		]) {
			const query = model.query();
			if (model !== DdnsProvider) query.where("is_deleted", 0);
			if (graph) query.withGraphFetched(graph);
			for (const row of await query) {
				const filePath = path.join(configDir, directory, `${row.id}.yaml`);
				await writeConfigFile(
					GITOPS_DIR,
					filePath,
					yaml.dump(internalGitOps.sanitizeForExport(row, ["is_deleted"]), { indent: 2 }),
				);
				exportedFiles.push(filePath);
			}
		}

		const settings = await settingModel.query().whereNot("id", "gitops-config");
		for (const setting of settings) {
			const filename = `${encodeURIComponent(setting.id)}.yaml`;
			const filePath = path.join(configDir, "settings", filename);
			const exportData = { ...setting };
			await writeConfigFile(GITOPS_DIR, filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}

		// Copy certificate files if they exist
		await internalGitOps.exportCertificateFiles(configDir, exportedFiles);

		// Prune stale files (files that exist in the config dir but were not just exported)
		// This ensures that deleted items are removed from the git repository
		const pruneDirectory = async (dir) => {
			if (!fs.existsSync(dir)) return;
			const items = await fs.promises.readdir(dir);
			for (const item of items) {
				const fullPath = path.join(dir, item);
				const stat = await fs.promises.lstat(fullPath);
				if (stat.isDirectory()) {
					await pruneDirectory(fullPath);
					// If empty after prune, delete dir
					if ((await fs.promises.readdir(fullPath)).length === 0) {
						await fs.promises.rmdir(fullPath);
					}
				} else {
					if (!exportedFiles.includes(fullPath)) {
						await fs.promises.unlink(fullPath);
						logger.info(`GitOps: Pruned stale file: ${fullPath.replace(GITOPS_DIR, "")}`);
					}
				}
			}
		};

		await pruneDirectory(configDir);

		logger.info(`Exported ${exportedFiles.length} configuration files`);
		return exportedFiles;
	},

	/**
	 * Export actual certificate files (PEM, key files)
	 * @param {string} configDir
	 * @param {string[]} exportedFiles
	 */
	exportCertificateFiles: async (configDir, exportedFiles) => {
		await assertSafeConfigTree(GITOPS_DIR, configDir);
		const certFilesDir = path.join(configDir, "certificate-files");
		if (!fs.existsSync(certFilesDir)) {
			await assertNoSymlinkPath(GITOPS_DIR, certFilesDir);
			await fs.promises.mkdir(certFilesDir, { recursive: true });
		}

		// Export Let's Encrypt certificates
		const letsencryptDir = "/data/tls/certbot/live";
		if (fs.existsSync(letsencryptDir)) {
			const domains = (await fs.promises.readdir(letsencryptDir)).filter((d) => !d.startsWith("."));
			for (const domain of domains) {
				const domainDir = path.join(letsencryptDir, domain);
				const targetDir = path.join(certFilesDir, "letsencrypt", domain);
				if (!fs.existsSync(targetDir)) {
					await assertNoSymlinkPath(GITOPS_DIR, targetDir);
					await fs.promises.mkdir(targetDir, { recursive: true });
				}
				// Copy cert files (exclude private keys)
				const certFiles = ["fullchain.pem", "cert.pem", "chain.pem"];
				for (const file of certFiles) {
					const srcPath = path.join(domainDir, file);
					const destPath = path.join(targetDir, file);
					if (fs.existsSync(srcPath)) {
						await writeConfigFile(GITOPS_DIR, destPath, await fs.promises.readFile(srcPath));
						exportedFiles.push(destPath);
					}
				}
			}
		}

		// Export custom certificates
		const customDir = "/data/tls/custom";
		if (fs.existsSync(customDir)) {
			const items = await fs.promises.readdir(customDir);
			const customTargetDir = path.join(certFilesDir, "custom");
			if (!fs.existsSync(customTargetDir)) {
				await assertNoSymlinkPath(GITOPS_DIR, customTargetDir);
				await fs.promises.mkdir(customTargetDir, { recursive: true });
			}
			for (const item of items) {
				const srcPath = path.join(customDir, item);
				const destPath = path.join(customTargetDir, item);
				const stats = await fs.promises.stat(srcPath);

				if (stats.isFile()) {
					if (!item.includes("privkey") && !item.endsWith(".key")) {
						await writeConfigFile(GITOPS_DIR, destPath, await fs.promises.readFile(srcPath));
						exportedFiles.push(destPath);
					}
				} else if (stats.isDirectory() && item.startsWith("npm-")) {
					// Custom certs are often in folders like "npm-12"
					if (!fs.existsSync(destPath)) {
						await assertNoSymlinkPath(GITOPS_DIR, destPath);
						await fs.promises.mkdir(destPath, { recursive: true });
					}
					const files = await fs.promises.readdir(srcPath);
					for (const file of files) {
						if (!file.includes("privkey") && !file.endsWith(".key")) {
							const srcFile = path.join(srcPath, file);
							const destFile = path.join(destPath, file);
							if ((await fs.promises.stat(srcFile)).isFile()) {
								await writeConfigFile(GITOPS_DIR, destFile, await fs.promises.readFile(srcFile));
								exportedFiles.push(destFile);
							}
						}
					}
				}
			}
		}

		// Export Internal Certificates (Root CA + Leaf Certs)
		const internalDir = "/data/tls/internal";
		if (fs.existsSync(internalDir)) {
			const internalTargetDir = path.join(certFilesDir, "internal");
			if (!fs.existsSync(internalTargetDir)) {
				await assertNoSymlinkPath(GITOPS_DIR, internalTargetDir);
				await fs.promises.mkdir(internalTargetDir, { recursive: true });
			}

			// Export Root CA files (exclude private keys)
			const rootFiles = ["root_ca.crt", "root_ca.srl"];
			for (const file of rootFiles) {
				const srcPath = path.join(internalDir, file);
				const destPath = path.join(internalTargetDir, file);
				if (fs.existsSync(srcPath)) {
					await writeConfigFile(GITOPS_DIR, destPath, await fs.promises.readFile(srcPath));
					exportedFiles.push(destPath);
				}
			}

			// Export leaf cert directories (npm-*)
			const items = await fs.promises.readdir(internalDir);
			for (const item of items) {
				const itemPath = path.join(internalDir, item);
				if ((await fs.promises.stat(itemPath)).isDirectory() && item.startsWith("npm-")) {
					const destDir = path.join(internalTargetDir, item);
					if (!fs.existsSync(destDir)) {
						await assertNoSymlinkPath(GITOPS_DIR, destDir);
						await fs.promises.mkdir(destDir, { recursive: true });
					}

					// Copy folder content
					const files = await fs.promises.readdir(itemPath);
					for (const file of files) {
						if (!file.includes("privkey") && !file.endsWith(".key")) {
							const srcFile = path.join(itemPath, file);
							const destFile = path.join(destDir, file);
							await writeConfigFile(GITOPS_DIR, destFile, await fs.promises.readFile(srcFile));
							exportedFiles.push(destFile);
						}
					}
				}
			}
		}
	},

	/**
	 * Sanitize an object for export (remove sensitive/internal fields)
	 * @param {Object} obj
	 * @param {string[]} excludeFields
	 * @returns {Object}
	 */
	sanitizeForExport: (obj, excludeFields) => {
		const result = { ...obj };
		for (const field of excludeFields) {
			delete result[field];
		}
		return result;
	},

	/**
	 * Commit and push changes
	 * @param {string} [message]
	 * @returns {Promise<{success: boolean, commit?: string, message?: string}>}
	 */
	commitAndPush: async (message) => {
		if (isDemoMode()) {
			throw new errs.AuthError("GitOps is disabled in Demo Mode");
		}

		const config = await internalGitOps.getConfigInternal();

		if (!config.enabled) {
			return { success: false, message: "GitOps is not enabled" };
		}

		try {
			await internalGitOps.initRepo();

			// Stage all changes
			await git.add({ fs, dir: GITOPS_DIR, filepath: "." });

			// Check if there are changes to commit
			const status = await git.statusMatrix({ fs, dir: GITOPS_DIR });
			const hasChanges = status.some(([, head, workdir, stage]) => head !== workdir || head !== stage);

			if (!hasChanges) {
				return { success: true, message: "No changes to commit" };
			}

			// Commit
			const commitMessage = message || `ShieldPM configuration backup - ${new Date().toISOString()}`;
			const sha = await git.commit({
				fs,
				dir: GITOPS_DIR,
				message: commitMessage,
				author: {
					name: "ShieldPM GitOps",
					email: "gitops@shieldpm.local",
				},
			});

			// Add remote if not exists
			const remotes = await git.listRemotes({ fs, dir: GITOPS_DIR });
			const hasOrigin = remotes.some((r) => r.remote === "origin");

			if (!hasOrigin && config.repository_url) {
				await git.addRemote({
					fs,
					dir: GITOPS_DIR,
					remote: "origin",
					url: config.repository_url,
				});
			} else if (hasOrigin && config.repository_url) {
				// Update remote URL if changed
				await git.deleteRemote({ fs, dir: GITOPS_DIR, remote: "origin" });
				await git.addRemote({
					fs,
					dir: GITOPS_DIR,
					remote: "origin",
					url: config.repository_url,
				});
			}

			// Push if remote is configured
			if (config.repository_url) {
				await git.push({
					fs,
					http,
					dir: GITOPS_DIR,
					remote: "origin",
					ref: config.branch || "main",
					...getAuth(config),
				});
			}

			// Update last sync time — patch only necessary fields, never spread
			// the full config object to avoid accidentally overwriting encrypted_credentials
			// with [REDACTED] if getConfig() was used instead of getConfigInternal()
			// Update only last_sync/last_error fields within the meta JSON.
			// Using a raw expression to JSON-merge only those fields, without
			// touching encrypted_credentials or other meta fields.
			const meta1 = await internalGitOps.getConfigInternal();
			const updatedMeta1 = { ...meta1, last_sync: new Date().toISOString(), last_error: null };
			await settingModel.query().where("id", "gitops-config").patch({ meta: updatedMeta1 });

			logger.info(`GitOps: Committed and pushed ${sha}`);
			return { success: true, commit: sha };
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Unknown error";
			logger.error("GitOps commit/push failed:", err);

			// Update error state — patch only last_error, not entire config
			const meta2 = await internalGitOps.getConfigInternal();
			const updatedMeta2 = { ...meta2, last_error: errorMessage };
			await settingModel.query().where("id", "gitops-config").patch({ meta: updatedMeta2 });

			return { success: false, message: errorMessage };
		}
	},

	/**
	 * Pull from remote
	 * @returns {Promise<{success: boolean, message?: string}>}
	 */
	pull: async () => {
		if (isDemoMode()) {
			throw new errs.AuthError("GitOps is disabled in Demo Mode");
		}

		const config = await internalGitOps.getConfigInternal();

		if (!config.enabled || !config.repository_url) {
			return { success: false, message: "GitOps is not enabled or repository not configured" };
		}

		try {
			await internalGitOps.initRepo();

			// Ensure remote exists
			const remotes = await git.listRemotes({ fs, dir: GITOPS_DIR });
			const hasOrigin = remotes.some((r) => r.remote === "origin");

			if (!hasOrigin) {
				await git.addRemote({
					fs,
					dir: GITOPS_DIR,
					remote: "origin",
					url: config.repository_url,
				});
			}

			await git.pull({
				fs,
				http,
				dir: GITOPS_DIR,
				ref: config.branch || "main",
				singleBranch: true,
				author: {
					name: "ShieldPM GitOps",
					email: "gitops@shieldpm.local",
				},
				...getAuth(config),
			});

			// Update last sync time
			// Update only last_sync/last_error fields within the meta JSON.
			// Using a raw expression to JSON-merge only those fields, without
			// touching encrypted_credentials or other meta fields.
			const meta1 = await internalGitOps.getConfigInternal();
			const updatedMeta1 = { ...meta1, last_sync: new Date().toISOString(), last_error: null };
			await settingModel.query().where("id", "gitops-config").patch({ meta: updatedMeta1 });

			logger.info("GitOps: Pulled from remote");
			return { success: true, message: "Pull successful" };
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Unknown error";
			logger.error("GitOps pull failed:", err);
			return { success: false, message: errorMessage };
		}
	},

	/**
	 * Get commit history
	 * @param {number} [limit=20]
	 * @returns {Promise<GitCommit[]>}
	 */
	getHistory: async (limit = 20) => {
		try {
			await internalGitOps.initRepo();

			const commits = await git.log({
				fs,
				dir: GITOPS_DIR,
				depth: limit,
			});

			return commits.map((commit) => ({
				sha: commit.oid,
				message: commit.commit.message,
				author: commit.commit.author.name,
				date: new Date(commit.commit.author.timestamp * 1000).toISOString(),
			}));
		} catch (err) {
			// No commits yet or other error
			logger.debug("GitOps: Could not get history:", err);
			return [];
		}
	},

	/**
	 * Revert to a specific commit
	 * @param {import("../lib/types.js").Access} access
	 * @param {string} sha
	 * @returns {Promise<{success: boolean, message?: string}>}
	 */
	revertToCommit: async (access, sha) => {
		await access.can("settings:update", "gitops-config");

		if (isDemoMode()) {
			throw new errs.AuthError("GitOps is disabled in Demo Mode");
		}

		try {
			await internalGitOps.initRepo();

			// Checkout the specific commit
			await git.checkout({
				fs,
				dir: GITOPS_DIR,
				ref: sha,
				force: true,
			});

			logger.info(`GitOps: Reverted to commit ${sha}`);

			// Apply configuration
			logger.info("GitOps: Applying reverted configuration...");
			const importResult = await internalGitOps.importConfig(access, { overwrite: true });

			if (importResult.success) {
				// Restart only this service; PID 1 can be the native host's init system.
				logger.info("GitOps Revert: Scheduling backend restart in 1 second...");
				setTimeout(() => {
					logger.info("GitOps Revert: Restarting backend via SIGTERM...");
					try {
						process.kill(process.pid, "SIGTERM");
					} catch (e) {
						logger.error("Failed to stop backend:", e);
						process.exit(1); // Fallback
					}
				}, 1000);

				return { success: true, message: `Reverted to ${sha}. Backend will restart now.` };
			}
			return {
				success: false,
				message: `Reverted to ${sha} but import failed: ${importResult.errors.join(", ")}`,
			};
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Unknown error";
			logger.error("GitOps revert failed:", err);
			return { success: false, message: errorMessage };
		}
	},

	/**
	 * Import configuration from Git repository
	 * @param {import("../lib/types.js").Access} access
	 * @param {Object} options
	 * @param {boolean} [options.overwrite=false] - Overwrite existing hosts
	 * @returns {Promise<{success: boolean, imported: number, skipped: number, deleted: number, errors: string[]}>}
	 */
	importConfig: async (access, options = {}) => {
		if (isDemoMode()) {
			throw new errs.AuthError("GitOps is disabled in Demo Mode");
		}

		await access.can("settings:update", "gitops-config");

		const configDir = getConfigDir();
		await assertSafeConfigTree(GITOPS_DIR, configDir);
		let imported = 0;
		let skipped = 0;
		let deleted = 0;
		const errors = [];

		/**
		 * Helper to import standard models and DELETE missing ones (Full Sync)
		 * @param {Object} modelClass - Objection.js Model class
		 * @param {string} dirName - Directory name in gitops repo
		 * @param {string} [hostType] - Host type string for Nginx (e.g. 'proxy_host')
		 * @param {string|null} [relationGraph] - Relation graph for insertGraph/upsertGraph
		 */
		const importModel = async (modelClass, dirName, hostType = null, relationGraph = null) => {
			const dirPath = path.join(configDir, dirName);
			const importedIds = [];
			const errorCountBeforeImport = errors.length;
			// Older backups do not contain every integration. Absence is not a deletion request.
			if (!fs.existsSync(dirPath)) return;

			if (fs.existsSync(dirPath)) {
				const files = await fs.promises.readdir(dirPath);
				const yamlFiles = files.filter((f) => f.endsWith(".yaml"));

				await Promise.all(
					yamlFiles.map(async (file) => {
						try {
							const content = await fs.promises.readFile(path.join(dirPath, file), "utf8");
							const data = yaml.load(content);

							if (data && typeof data === "object") {
								// Apply field whitelist validation to prevent DB field injection
								const itemData = sanitizeImportData(modelClass.name, data);
								if (!itemData) {
									errors.push(
										`${dirName}/${file}: Model "${modelClass.name}" not allowed or no valid fields`,
									);
									return;
								}
								const existingId = itemData.id;
								if (!Number.isSafeInteger(existingId) || existingId <= 0) {
									throw new errs.ValidationError("Imported objects require a positive integer ID");
								}

								if (existingId) {
									importedIds.push(existingId);
									const existing = await modelClass.query().findById(existingId);
									if (existing && !options.overwrite) {
										skipped++;
										return;
									}
								}

								// Ensure item is not marked as deleted upon restore
								if (modelClass !== DdnsProvider) itemData.is_deleted = 0;
								if (modelClass === ProxyHost && Array.isArray(itemData.domain_names)) {
									itemData.host_domains = itemData.domain_names.map((domain_name) => ({
										domain_name,
									}));
									delete itemData.domain_names;
								}

								// Ensure owner_user_id is valid
								if (itemData.owner_user_id) {
									// Check if user exists, if not set to current user to avoid constraint error
								}

								if (options.overwrite && existingId) {
									// Use upsertGraph for complex models
									if (relationGraph) {
										await modelClass.query().upsertGraph(itemData, {
											insertMissing: true,
											relate: true,
											update: true,
											noDelete: false, // Delete missing children (items/clients)
										});
									} else {
										const existing = await modelClass.query().findById(existingId);
										if (existing) {
											await modelClass.query().patchAndFetchById(existingId, itemData);
										} else {
											await modelClass.query().insert(itemData);
										}
									}
								} else {
									if (modelClass !== User && !itemData.owner_user_id)
										itemData.owner_user_id = access.token.getUserId(1);

									let newRow;
									if (relationGraph) {
										newRow = await modelClass.query().insertGraph(itemData);
									} else {
										newRow = await modelClass.query().insert(itemData);
									}

									if (itemData.id) importedIds.push(itemData.id);
									else if (newRow?.id) importedIds.push(newRow.id);
								}
								imported++;
							} else {
								throw new errs.ValidationError("Expected a YAML object");
							}
						} catch (err) {
							logger.error(`Import failed for ${dirName}/${file}:`, err);
							errors.push(`${dirName}/${file}: ${err instanceof Error ? err.message : "Unknown error"}`);
						}
					}),
				);
			}

			// FULL SYNC: Delete items not in importedIds
			if (options.overwrite && errors.length === errorCountBeforeImport) {
				const query = modelClass.query().whereNotIn("id", importedIds);

				try {
					const staleItems = await query;
					const deletePromises = staleItems.map(async (item) => {
						if (modelClass === User && item.id === access.token.getUserId(1)) return;
						// Delete Nginx config if hostType is provided
						if (hostType) {
							await internalNginx.deleteConfig(hostType, item);
						}

						// Soft delete if supported, else hard delete
						if (item.is_deleted !== undefined) {
							await modelClass.query().patchAndFetchById(item.id, { is_deleted: 1 });
						} else {
							await modelClass.query().deleteById(item.id);
						}
						deleted++;
						logger.info(`GitOps Full Sync: Deleted ${dirName} #${item.id}`);
					});

					for (const result of await Promise.allSettled(deletePromises)) {
						if (result.status === "rejected") errors.push(`${dirName}: ${result.reason.message}`);
					}
				} catch (err) {
					logger.warn(`GitOps Cleanup failed for ${dirName}:`, err);
				}
			}
		};

		try {
			// 1. Import Users first
			await importModel(User, "users", null, "permissions");

			// 2. Import Certificates
			await importModel(Certificate, "certificates");

			// 3. Import Access Lists
			await importModel(AccessList, "access-lists", null, "[items, clients]");

			// 4. Import Hosts & Streams
			await importModel(ProxyHost, "proxy-hosts", "proxy_host", "host_domains");
			await importModel(RedirectionHost, "redirection-hosts", "redirection_host");
			await importModel(DeadHost, "dead-hosts", "dead_host");
			await importModel(Stream, "streams", "stream");
			await importModel(CloudflaredTunnel, "cloudflared-tunnels");
			await importModel(DdnsProvider, "ddns-providers");

			// 5. Import Settings
			const settingsDir = path.join(configDir, "settings");
			if (fs.existsSync(settingsDir)) {
				const files = await fs.promises.readdir(settingsDir);
				const yamlFiles = files.filter((f) => f.endsWith(".yaml"));

				await Promise.all(
					yamlFiles.map(async (file) => {
						try {
							const content = await fs.promises.readFile(path.join(settingsDir, file), "utf8");
							const data = yaml.load(content);
							if (data && typeof data === "object") {
								// Apply field whitelist validation for settings
								const settingData = sanitizeImportData("Setting", data);
								if (!settingData || typeof settingData.id !== "string" || !settingData.id) {
									errors.push(`settings/${file}: No valid fields allowed`);
									return;
								}

								if (settingData.id === "gitops-config") return;

								const existing = await settingModel.query().findById(settingData.id);
								if (existing) {
									await settingModel.query().patchAndFetchById(settingData.id, settingData);
								} else {
									await settingModel.query().insert(settingData);
								}
								imported++;
							}
						} catch (err) {
							errors.push(`settings/${file}: ${err instanceof Error ? err.message : "Unknown error"}`);
						}
					}),
				);
			}

			// 6. Restore Certificate Files
			const certFilesDir = path.join(configDir, "certificate-files");
			if (fs.existsSync(certFilesDir)) {
				const isBlockedPrivateKeyRestore = (filePath) => {
					const filename = path.basename(filePath).toLowerCase();
					return filename.endsWith(".key") || filename === "privkey.pem" || filename === "root_ca.key";
				};

				const getSafeStats = async (srcPath) => {
					const stats = await fs.promises.lstat(srcPath);
					if (stats.isSymbolicLink()) {
						logger.warn(`GitOps restore: skipping symbolic link ${srcPath}`);
						return null;
					}
					return stats;
				};

				const restoreFile = async (src, dest) => {
					const stats = await getSafeStats(src);
					if (!stats?.isFile()) {
						return false;
					}

					if (isBlockedPrivateKeyRestore(src) || isBlockedPrivateKeyRestore(dest)) {
						logger.warn(`GitOps restore: blocked private key restore for ${src}`);
						return false;
					}

					await fs.promises.copyFile(src, dest);
					// Set permissions
					if (dest.endsWith(".key") || dest.endsWith(".pem")) {
						const filename = path.basename(dest);
						if (filename === "privkey.pem" || filename.endsWith(".key")) {
							await fs.promises.chmod(dest, 0o600);
						} else {
							await fs.promises.chmod(dest, 0o644);
						}
					}

					return true;
				};

				// Restore Let's Encrypt
				const leDir = path.join(certFilesDir, "letsencrypt");
				if (fs.existsSync(leDir)) {
					const domains = await fs.promises.readdir(leDir);
					for (const domain of domains) {
						const srcDir = path.join(leDir, domain);
						const srcDirStats = await getSafeStats(srcDir);
						if (!srcDirStats?.isDirectory()) {
							continue;
						}

						const targetDir = path.join("/data/tls/certbot/live", domain);
						if (!fs.existsSync(targetDir)) {
							await fs.promises.mkdir(targetDir, { recursive: true });
						}
						const files = await fs.promises.readdir(srcDir);
						for (const file of files) {
							try {
								await restoreFile(path.join(srcDir, file), path.join(targetDir, file));
							} catch (err) {
								logger.error(
									`GitOps restore failed for ${path.join(srcDir, file)}: ${err instanceof Error ? err.message : "Unknown error"}`,
								);
								throw err;
							}
						}
					}
				}

				// Restore Custom Certs
				const customDir = path.join(certFilesDir, "custom");
				if (fs.existsSync(customDir)) {
					const targetDir = "/data/tls/custom";
					if (!fs.existsSync(targetDir)) {
						await fs.promises.mkdir(targetDir, { recursive: true });
					}
					const items = await fs.promises.readdir(customDir);
					for (const item of items) {
						const srcPath = path.join(customDir, item);
						const destPath = path.join(targetDir, item);
						const stats = await getSafeStats(srcPath);

						if (!stats) {
							continue;
						}

						if (stats.isFile()) {
							try {
								await restoreFile(srcPath, destPath);
							} catch (err) {
								logger.error(
									`GitOps restore failed for ${srcPath}: ${err instanceof Error ? err.message : "Unknown error"}`,
								);
								throw err;
							}
						} else if (stats.isDirectory() && item.startsWith("npm-")) {
							if (!fs.existsSync(destPath)) {
								await fs.promises.mkdir(destPath, { recursive: true });
							}
							const files = await fs.promises.readdir(srcPath);
							for (const file of files) {
								try {
									await restoreFile(path.join(srcPath, file), path.join(destPath, file));
								} catch (err) {
									logger.error(
										`GitOps restore failed for ${path.join(srcPath, file)} -> ${path.join(destPath, file)}: ${err instanceof Error ? err.message : "Unknown error"}`,
									);
									throw err;
								}
							}
						}
					}
				}

				// Restore Internal Certificates
				const internalDir = path.join(certFilesDir, "internal");
				if (fs.existsSync(internalDir)) {
					const targetBaseDir = "/data/tls/internal";
					if (!fs.existsSync(targetBaseDir)) {
						await fs.promises.mkdir(targetBaseDir, { recursive: true });
					}

					const internalItems = await fs.promises.readdir(internalDir);
					for (const item of internalItems) {
						const srcPath = path.join(internalDir, item);
						const destPath = path.join(targetBaseDir, item);
						const stat = await getSafeStats(srcPath);

						if (!stat) {
							continue;
						}

						if (stat.isFile()) {
							try {
								await restoreFile(srcPath, destPath);
							} catch (err) {
								logger.error(
									`GitOps restore failed for ${srcPath}: ${err instanceof Error ? err.message : "Unknown error"}`,
								);
								throw err;
							}
						} else if (stat.isDirectory() && item.startsWith("npm-")) {
							const destDir = path.join(targetBaseDir, item);
							if (!fs.existsSync(destDir)) {
								await fs.promises.mkdir(destDir, { recursive: true });
							}
							const files = await fs.promises.readdir(srcPath);
							for (const file of files) {
								try {
									await restoreFile(path.join(srcPath, file), path.join(destDir, file));
								} catch (err) {
									logger.error(
										`GitOps restore failed for ${path.join(srcPath, file)}: ${err instanceof Error ? err.message : "Unknown error"}`,
									);
									throw err;
								}
							}
						}
					}
				}
			}

			// 7. Regenerate Nginx Configs
			await internalNginx.bulkGenerateConfigs(
				ProxyHost,
				"proxy_host",
				await ProxyHost.query().where("is_deleted", 0).withGraphFetched("host_domains"),
			);
			await internalNginx.bulkGenerateConfigs(
				RedirectionHost,
				"redirection_host",
				await RedirectionHost.query().where("is_deleted", 0),
			);
			await internalNginx.bulkGenerateConfigs(
				DeadHost,
				"dead_host",
				await DeadHost.query().where("is_deleted", 0),
			);
			await internalNginx.bulkGenerateConfigs(Stream, "stream", await Stream.query().where("is_deleted", 0));

			await internalNginx.reload();

			logger.info(
				`GitOps import: ${imported} imported, ${skipped} skipped, ${deleted} deleted, ${errors.length} errors`,
			);
			return { success: errors.length === 0, imported, skipped, deleted, errors };
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Unknown error";
			logger.error("GitOps import failed:", err);
			return { success: false, imported, skipped, deleted, errors: [...errors, errorMessage] };
		}
	},

	/**
	 * Initialize on startup if auto-pull is enabled
	 */
	init: async () => {
		try {
			const config = await internalGitOps.getConfigInternal();
			if (config.enabled && config.auto_pull_on_startup && config.repository_url) {
				logger.info("GitOps: Auto-pulling on startup...");
				await internalGitOps.pull();
			}
		} catch (err) {
			logger.warn("GitOps: Failed to initialize:", err);
		}
	},

	/**
	 * Debounce timer for auto-push
	 * @type {NodeJS.Timeout | null}
	 */
	_autoPushTimer: null,

	/**
	 * Trigger auto-push if enabled (debounced)
	 * Call this after any configuration change (host create/update/delete)
	 * @param {string} [changeType] - Type of change for commit message
	 */
	triggerAutoPush: (changeType = "configuration") => {
		// Clear existing timer
		if (internalGitOps._autoPushTimer) {
			clearTimeout(internalGitOps._autoPushTimer);
		}

		// Debounce: wait 5 seconds before pushing (batch multiple changes)
		internalGitOps._autoPushTimer = setTimeout(async () => {
			try {
				const config = await internalGitOps.getConfigInternal();
				if (!config.enabled || !config.auto_push || !config.repository_url) {
					return;
				}

				logger.info(`GitOps: Auto-push triggered by ${changeType} change`);

				// Export and push
				await internalGitOps.exportConfig();
				const result = await internalGitOps.commitAndPush(`Auto-backup: ${changeType} changed`);

				if (result.success) {
					logger.info(`GitOps: Auto-push completed: ${result.commit || result.message}`);
				} else {
					logger.warn(`GitOps: Auto-push failed: ${result.message}`);
				}
			} catch (err) {
				logger.error("GitOps: Auto-push error:", err);
			}
		}, 5000);
	},
};

// Attach sanitization helpers for testing
internalGitOps.ALLOWED_IMPORT_FIELDS = ALLOWED_IMPORT_FIELDS;
internalGitOps.sanitizeImportData = sanitizeImportData;

export default internalGitOps;
