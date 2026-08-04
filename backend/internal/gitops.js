import fs from "node:fs";
import path from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import * as yaml from "js-yaml";
import _ from "lodash";
import { isDemoMode } from "../lib/config.js";
import { decrypt, encrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import { global as logger } from "../logger.js";
import AccessList from "../models/access_list.js";
import Certificate from "../models/certificate.js";
import CloudflaredTunnel from "../models/cloudflared_tunnel.js";
import DdnsProvider from "../models/ddns_provider.js";
import DeadHost from "../models/dead_host.js";
import FirewallPolicy from "../models/firewall_policy.js";
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
		"email",
		"nickname",
		"password",
		"role",
		"otp_enabled",
		"otp_secret",
		"allowed_ids",
		"last_login",
		"last_failed_login",
		"failed_login_count",
		"is_deleted",
		"owner_user_id",
	],
	Certificate: ["id", "nice_name", "domain_names", "provider", "expires_on", "is_deleted", "owner_user_id"],
	AccessList: ["id", "name", "items", "clients", "is_deleted", "owner_user_id"],
	FirewallPolicy: [
		"id",
		"name",
		"enabled",
		"action",
		"geo_mode",
		"geo_countries",
		"allow_cidrs",
		"block_cidrs",
		"feed_urls",
		"refresh_interval_hours",
	],
	ProxyHost: [
		"id",
		"domain_names",
		"forward_host",
		"forward_port",
		"forward_scheme",
		"access_list_id",
		"firewall_policy_id",
		"http_options",
		"ssl_options",
		"nginx_options",
		"nginx_settings",
		"is_deleted",
		"owner_user_id",
	],
	RedirectionHost: [
		"id",
		"domain_names",
		"target_url",
		"redirect_code",
		"access_list_id",
		"is_deleted",
		"owner_user_id",
	],
	DeadHost: ["id", "domain_names", "alternative_target_url", "mode", "is_deleted", "owner_user_id"],
	Stream: ["id", "incoming_port", "target_url", "stream_type", "access_list_id", "is_deleted", "owner_user_id"],
	CloudflaredTunnel: ["id", "name", "tunnel_id", "created_at", "is_deleted", "owner_user_id"],
	DdnsProvider: ["id", "name", "provider", "config", "is_deleted", "owner_user_id"],
	Setting: ["id", "value", "meta"],
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
	return _.pick(data, allowed);
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

		await internalGitOps.initRepo();
		const configDir = getConfigDir();
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
			"firewall-policies",
		];
		for (const dir of dirs) {
			const dirPath = path.join(configDir, dir);
			if (!fs.existsSync(dirPath)) {
				await fs.promises.mkdir(dirPath, { recursive: true });
			}
		}

		// Export firewall policies before hosts so a restore can retain host assignments.
		// Feed status and timestamps are operational cache, not declarative configuration.
		const firewallPolicies = await FirewallPolicy.query().orderBy("id", "ASC");
		for (const policy of firewallPolicies) {
			const filename = `${policy.id}-${policy.name.replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
			const filePath = path.join(configDir, "firewall-policies", filename);
			const exportData = _.pick(policy, ALLOWED_IMPORT_FIELDS.FirewallPolicy);
			await fs.promises.writeFile(filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}

		// Export Proxy Hosts
		const proxyHosts = await ProxyHost.query().where("is_deleted", 0).withGraphFetched("host_domains");
		for (const host of proxyHosts) {
			const filename = `${host.id}-${(host.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
			const filePath = path.join(configDir, "proxy-hosts", filename);
			const exportData = internalGitOps.sanitizeForExport(host, ["is_deleted"]);
			await fs.promises.writeFile(filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}

		// Export Redirection Hosts
		const redirectionHosts = await RedirectionHost.query().where("is_deleted", 0);
		for (const host of redirectionHosts) {
			const filename = `${host.id}-${(host.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
			const filePath = path.join(configDir, "redirection-hosts", filename);
			const exportData = internalGitOps.sanitizeForExport(host, ["is_deleted"]);
			await fs.promises.writeFile(filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}

		// Export Dead Hosts
		const deadHosts = await DeadHost.query().where("is_deleted", 0);
		for (const host of deadHosts) {
			const filename = `${host.id}-${(host.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
			const filePath = path.join(configDir, "dead-hosts", filename);
			const exportData = internalGitOps.sanitizeForExport(host, ["is_deleted"]);
			await fs.promises.writeFile(filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}

		// Export Streams
		const streams = await Stream.query().where("is_deleted", 0);
		for (const stream of streams) {
			const filename = `${stream.id}-${stream.incoming_port || "unknown"}.yaml`;
			const filePath = path.join(configDir, "streams", filename);
			const exportData = internalGitOps.sanitizeForExport(stream, ["is_deleted"]);
			await fs.promises.writeFile(filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}

		// Export Certificates (database entries only, not the actual cert files)
		const certificates = await Certificate.query().where("is_deleted", 0);
		for (const cert of certificates) {
			const filename = `${cert.id}-${(cert.nice_name || cert.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
			const filePath = path.join(configDir, "certificates", filename);
			const exportData = internalGitOps.sanitizeForExport(cert, ["is_deleted"]);
			await fs.promises.writeFile(filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}

		// Export Users (with permissions, excluding password hashes for security)
		const users = await User.query().where("is_deleted", 0).withGraphFetched("permissions");
		for (const user of users) {
			const filename = `${user.id}-${(user.nickname || user.email || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
			const filePath = path.join(configDir, "users", filename);
			const exportData = internalGitOps.sanitizeForExport(user, ["is_deleted"]);
			await fs.promises.writeFile(filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}

		// Export Settings (excluding gitops-config to avoid overwriting credentials)
		const settings = await settingModel.query().whereNot("id", "gitops-config");
		for (const setting of settings) {
			const filename = `${setting.id}.yaml`;
			const filePath = path.join(configDir, "settings", filename);
			const exportData = { ...setting };
			await fs.promises.writeFile(filePath, yaml.dump(exportData, { indent: 2 }));
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
				const stat = await fs.promises.stat(fullPath);
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
		const certFilesDir = path.join(configDir, "certificate-files");
		if (!fs.existsSync(certFilesDir)) {
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
					await fs.promises.mkdir(targetDir, { recursive: true });
				}
				// Copy cert files (exclude private keys)
				const certFiles = ["fullchain.pem", "cert.pem", "chain.pem"];
				for (const file of certFiles) {
					const srcPath = path.join(domainDir, file);
					const destPath = path.join(targetDir, file);
					if (fs.existsSync(srcPath)) {
						await fs.promises.copyFile(srcPath, destPath);
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
				await fs.promises.mkdir(customTargetDir, { recursive: true });
			}
			for (const item of items) {
				const srcPath = path.join(customDir, item);
				const destPath = path.join(customTargetDir, item);
				const stats = await fs.promises.stat(srcPath);

				if (stats.isFile()) {
					if (!item.includes("privkey") && !item.endsWith(".key")) {
						await fs.promises.copyFile(srcPath, destPath);
						exportedFiles.push(destPath);
					}
				} else if (stats.isDirectory() && item.startsWith("npm-")) {
					// Custom certs are often in folders like "npm-12"
					if (!fs.existsSync(destPath)) {
						await fs.promises.mkdir(destPath, { recursive: true });
					}
					const files = await fs.promises.readdir(srcPath);
					for (const file of files) {
						if (!file.includes("privkey") && !file.endsWith(".key")) {
							const srcFile = path.join(srcPath, file);
							const destFile = path.join(destPath, file);
							if ((await fs.promises.stat(srcFile)).isFile()) {
								await fs.promises.copyFile(srcFile, destFile);
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
				await fs.promises.mkdir(internalTargetDir, { recursive: true });
			}

			// Export Root CA files (exclude private keys)
			const rootFiles = ["root_ca.crt", "root_ca.srl"];
			for (const file of rootFiles) {
				const srcPath = path.join(internalDir, file);
				const destPath = path.join(internalTargetDir, file);
				if (fs.existsSync(srcPath)) {
					await fs.promises.copyFile(srcPath, destPath);
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
						await fs.promises.mkdir(destDir, { recursive: true });
					}

					// Copy folder content
					const files = await fs.promises.readdir(itemPath);
					for (const file of files) {
						if (!file.includes("privkey") && !file.endsWith(".key")) {
							const srcFile = path.join(itemPath, file);
							const destFile = path.join(destDir, file);
							await fs.promises.copyFile(srcFile, destFile);
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
				// Restart Container after 1 second to allow response to be sent
				logger.info("GitOps Revert: Scheduling container restart in 1 second...");
				setTimeout(() => {
					logger.info("GitOps Revert: Restarting container via SIGTERM (PID 1)...");
					try {
						process.kill(1, "SIGTERM");
					} catch (e) {
						logger.error("Failed to kill PID 1:", e);
						process.exit(1); // Fallback
					}
				}, 1000);

				return { success: true, message: `Reverted to ${sha}. Container will restart now.` };
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
		const importModel = async (modelClass, dirName, hostType = null, relationGraph = null, importOptions = {}) => {
			const dirPath = path.join(configDir, dirName);
			const importedIds = [];

			if (fs.existsSync(dirPath)) {
				const files = await fs.promises.readdir(dirPath);
				const yamlFiles = files.filter((f) => f.endsWith(".yaml"));

				await Promise.all(
					yamlFiles.map(async (file) => {
						try {
							const content = await fs.promises.readFile(path.join(dirPath, file), "utf8");
							const data = yaml.load(content);

							if (data && typeof data === "object") {
								// Use only the whitelist result. Merging it into raw YAML would retain
								// injected properties and defeat the import boundary.
								const itemData = sanitizeImportData(modelClass.name, data);
								if (!itemData) {
									errors.push(
										`${dirName}/${file}: Model "${modelClass.name}" not allowed or no valid fields`,
									);
									return;
								}

								const existingId = itemData.id;

								if (existingId) {
									importedIds.push(existingId);
									const existing = await modelClass.query().findById(existingId);
									if (existing && !options.overwrite) {
										skipped++;
										return;
									}
								}

								// Policy rows are hard-deleted; other imported models use soft deletion.
								if (importOptions.supportsSoftDelete !== false) itemData.is_deleted = 0;

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
									if (!options.overwrite) delete itemData.id;
									if (!itemData.owner_user_id) itemData.owner_user_id = access.token.getUserId(1);

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
							}
						} catch (err) {
							logger.error(`Import failed for ${dirName}/${file}:`, err);
							errors.push(`${dirName}/${file}: ${err instanceof Error ? err.message : "Unknown error"}`);
						}
					}),
				);
			}

			// FULL SYNC: Delete items not in importedIds
			if (options.overwrite) {
				const query = modelClass.query().whereNotIn("id", importedIds);

				try {
					const staleItems = await query;
					const deletePromises = staleItems.map(async (item) => {
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

					await Promise.allSettled(deletePromises);
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

			// 4. Import policies before hosts so firewall_policy_id foreign keys remain valid.
			await importModel(FirewallPolicy, "firewall-policies", null, null, { supportsSoftDelete: false });

			// 5. Import Hosts & Streams
			await importModel(ProxyHost, "proxy-hosts", "proxy_host");
			await importModel(RedirectionHost, "redirection-hosts", "redirection_host");
			await importModel(DeadHost, "dead-hosts", "dead_host");
			await importModel(Stream, "streams", "stream");
			await importModel(CloudflaredTunnel, "cloudflared-tunnels");
			await importModel(DdnsProvider, "ddns-providers");

			// 6. Import Settings
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
								const settingData = /** @type {any} */ (data);

								// Apply field whitelist validation for settings
								const sanitized = sanitizeImportData("Setting", settingData);
								if (!sanitized) {
									errors.push(`settings/${file}: No valid fields allowed`);
									return;
								}
								Object.assign(settingData, sanitized);

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

			// 7. Restore Certificate Files
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

			// Render global policy maps before host configs that reference them. Dynamic import
			// avoids a GitOps <-> firewall-policy module cycle during application startup.
			const { writeFirewallConfig } = await import("./firewall-policy.js");
			await writeFirewallConfig();

			// 8. Regenerate Nginx Configs
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
			return { success: true, imported, skipped, deleted, errors };
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
