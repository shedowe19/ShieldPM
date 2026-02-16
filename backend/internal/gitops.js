import fs from "node:fs";
import path from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import yaml from "js-yaml";
import { isDemoMode } from "../lib/config.js";
import { decrypt, encrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
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
 * Async map with concurrency limit
 * @template T, U
 * @param {T[]} array
 * @param {(item: T, index: number) => Promise<U>} mapper
 * @param {number} concurrency
 * @returns {Promise<U[]>}
 */
const pMap = async (array, mapper, concurrency) => {
	const results = new Array(array.length);
	const iterator = array.entries();
	const workers = new Array(Math.min(concurrency, array.length)).fill(iterator).map(async (iter) => {
		for (const [index, item] of iter) {
			results[index] = await mapper(item, index);
		}
	});
	await Promise.all(workers);
	return results;
};

/**
 * Checks if a directory exists
 * @param {string} path
 * @returns {Promise<boolean>}
 */
const dirExists = async (path) => {
	try {
		await fs.promises.access(path);
		return true;
	} catch {
		return false;
	}
};

/**
 * Ensures the GitOps directory exists
 */
const ensureDir = async () => {
	if (!(await dirExists(GITOPS_DIR))) {
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

		if (!(await dirExists(configDir))) {
			await fs.promises.mkdir(configDir, { recursive: true });
		}

		const gitDir = path.join(GITOPS_DIR, ".git");
		if (!(await dirExists(gitDir))) {
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
			"access-lists",
			"certificates",
			"users",
			"settings",
			"settings",
			"cloudflared-tunnels",
			"ddns-providers",
		];

		await Promise.all(dirs.map(async (dir) => {
			const dirPath = path.join(configDir, dir);
			if (!(await dirExists(dirPath))) {
				await fs.promises.mkdir(dirPath, { recursive: true });
			}
		}));

		// Export Proxy Hosts
		const proxyHosts = await ProxyHost.query().where("is_deleted", 0);
		await pMap(proxyHosts, async (host) => {
			const filename = `${host.id}-${(host.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
			const filePath = path.join(configDir, "proxy-hosts", filename);
			const exportData = internalGitOps.sanitizeForExport(host, ["is_deleted"]);
			await fs.promises.writeFile(filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}, 20);

		// Export Redirection Hosts
		const redirectionHosts = await RedirectionHost.query().where("is_deleted", 0);
		await pMap(redirectionHosts, async (host) => {
			const filename = `${host.id}-${(host.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
			const filePath = path.join(configDir, "redirection-hosts", filename);
			const exportData = internalGitOps.sanitizeForExport(host, ["is_deleted"]);
			await fs.promises.writeFile(filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}, 20);

		// Export Dead Hosts
		const deadHosts = await DeadHost.query().where("is_deleted", 0);
		await pMap(deadHosts, async (host) => {
			const filename = `${host.id}-${(host.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
			const filePath = path.join(configDir, "dead-hosts", filename);
			const exportData = internalGitOps.sanitizeForExport(host, ["is_deleted"]);
			await fs.promises.writeFile(filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}, 20);

		// Export Streams
		const streams = await Stream.query().where("is_deleted", 0);
		await pMap(streams, async (stream) => {
			const filename = `${stream.id}-${stream.incoming_port || "unknown"}.yaml`;
			const filePath = path.join(configDir, "streams", filename);
			const exportData = internalGitOps.sanitizeForExport(stream, ["is_deleted"]);
			await fs.promises.writeFile(filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}, 20);

		// Export Access Lists (with items and clients - including hashed passwords)
		const accessLists = await AccessList.query().where("is_deleted", 0).withGraphFetched("[items, clients]");
		await pMap(accessLists, async (list) => {
			const filename = `${list.id}-${(list.name || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
			const filePath = path.join(configDir, "access-lists", filename);
			const exportData = internalGitOps.sanitizeForExport(list, ["is_deleted"]);
			// Keep hashed passwords for full restore capability
			await fs.promises.writeFile(filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}, 20);

		// Export Certificates (database entries only, not the actual cert files)
		const certificates = await Certificate.query().where("is_deleted", 0);
		await pMap(certificates, async (cert) => {
			const filename = `${cert.id}-${(cert.nice_name || cert.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
			const filePath = path.join(configDir, "certificates", filename);
			const exportData = internalGitOps.sanitizeForExport(cert, ["is_deleted"]);
			await fs.promises.writeFile(filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}, 20);

		// Export Users (with permissions, excluding password hashes for security)
		const users = await User.query().where("is_deleted", 0).withGraphFetched("permissions");
		await pMap(users, async (user) => {
			const filename = `${user.id}-${(user.nickname || user.email || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
			const filePath = path.join(configDir, "users", filename);
			const exportData = internalGitOps.sanitizeForExport(user, ["is_deleted"]);
			await fs.promises.writeFile(filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}, 20);

		// Export Settings (excluding gitops-config to avoid overwriting credentials)
		const settings = await settingModel.query().whereNot("id", "gitops-config");
		await pMap(settings, async (setting) => {
			const filename = `${setting.id}.yaml`;
			const filePath = path.join(configDir, "settings", filename);
			const exportData = { ...setting };
			await fs.promises.writeFile(filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}, 20);

		// Export Cloudflared Tunnels (including decrypted tokens for restore)
		const cloudflaredDir = path.join(configDir, "cloudflared-tunnels");
		if (!(await dirExists(cloudflaredDir))) {
			await fs.promises.mkdir(cloudflaredDir, { recursive: true });
		}
		const tunnels = await CloudflaredTunnel.query().where("is_deleted", 0);
		await pMap(tunnels, async (tunnel) => {
			const filename = `${tunnel.id}-${(tunnel.name || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
			const filePath = path.join(cloudflaredDir, filename);
			// Token is already decrypted by the model's $parseDatabaseJson
			const exportData = internalGitOps.sanitizeForExport(tunnel, ["is_deleted"]);
			await fs.promises.writeFile(filePath, yaml.dump(exportData, { indent: 2 }));
			exportedFiles.push(filePath);
		}, 20);

		// Copy certificate files if they exist
		await internalGitOps.exportCertificateFiles(configDir, exportedFiles);

		// Prune stale files (files that exist in the config dir but were not just exported)
		// This ensures that deleted items are removed from the git repository
		await internalGitOps.pruneDirectory(configDir, exportedFiles);

		logger.info(`Exported ${exportedFiles.length} configuration files`);
		return exportedFiles;
	},

	/**
	 * Prune stale files recursively
	 * @param {string} dir
	 * @param {string[]} exportedFiles
	 */
	pruneDirectory: async (dir, exportedFiles) => {
		if (!(await dirExists(dir))) return;

		const items = await fs.promises.readdir(dir);
		await pMap(items, async (item) => {
			const fullPath = path.join(dir, item);
			const stat = await fs.promises.stat(fullPath);
			if (stat.isDirectory()) {
				await internalGitOps.pruneDirectory(fullPath, exportedFiles);
				// If empty after prune, delete dir
				const contents = await fs.promises.readdir(fullPath);
				if (contents.length === 0) {
					await fs.promises.rmdir(fullPath);
				}
			} else {
				if (!exportedFiles.includes(fullPath)) {
					await fs.promises.unlink(fullPath);
					logger.info(`GitOps: Pruned stale file: ${fullPath.replace(GITOPS_DIR, "")}`);
				}
			}
		}, 20);
	},

	/**
	 * Export actual certificate files (PEM, key files)
	 * @param {string} configDir
	 * @param {string[]} exportedFiles
	 */
	exportCertificateFiles: async (configDir, exportedFiles) => {
		const certFilesDir = path.join(configDir, "certificate-files");
		if (!(await dirExists(certFilesDir))) {
			await fs.promises.mkdir(certFilesDir, { recursive: true });
		}

		// Export Let's Encrypt certificates
		const letsencryptDir = "/data/tls/certbot/live";
		if (await dirExists(letsencryptDir)) {
			const domains = (await fs.promises.readdir(letsencryptDir)).filter((d) => !d.startsWith("."));
			await pMap(domains, async (domain) => {
				const domainDir = path.join(letsencryptDir, domain);
				const targetDir = path.join(certFilesDir, "letsencrypt", domain);
				if (!(await dirExists(targetDir))) {
					await fs.promises.mkdir(targetDir, { recursive: true });
				}
				// Copy cert files
				const certFiles = ["fullchain.pem", "privkey.pem", "cert.pem", "chain.pem"];
				await Promise.all(certFiles.map(async (file) => {
					const srcPath = path.join(domainDir, file);
					const destPath = path.join(targetDir, file);
					if (await dirExists(srcPath)) {
						await fs.promises.copyFile(srcPath, destPath);
						exportedFiles.push(destPath);
					}
				}));
			}, 20);
		}

		// Export custom certificates
		const customDir = "/data/tls/custom";
		if (await dirExists(customDir)) {
			const items = await fs.promises.readdir(customDir);
			const customTargetDir = path.join(certFilesDir, "custom");
			if (!(await dirExists(customTargetDir))) {
				await fs.promises.mkdir(customTargetDir, { recursive: true });
			}
			await pMap(items, async (item) => {
				const srcPath = path.join(customDir, item);
				const destPath = path.join(customTargetDir, item);
				const stats = await fs.promises.stat(srcPath);

				if (stats.isFile()) {
					await fs.promises.copyFile(srcPath, destPath);
					exportedFiles.push(destPath);
				} else if (stats.isDirectory() && item.startsWith("npm-")) {
					// Custom certs are often in folders like "npm-12"
					if (!(await dirExists(destPath))) {
						await fs.promises.mkdir(destPath, { recursive: true });
					}
					const files = await fs.promises.readdir(srcPath);
					await Promise.all(files.map(async (file) => {
						const srcFile = path.join(srcPath, file);
						const destFile = path.join(destPath, file);
						const fileStats = await fs.promises.stat(srcFile);
						if (fileStats.isFile()) {
							await fs.promises.copyFile(srcFile, destFile);
							exportedFiles.push(destFile);
						}
					}));
				}
			}, 20);
		}

		// Export Internal Certificates (Root CA + Leaf Certs)
		const internalDir = "/data/tls/internal";
		if (await dirExists(internalDir)) {
			const internalTargetDir = path.join(certFilesDir, "internal");
			if (!(await dirExists(internalTargetDir))) {
				await fs.promises.mkdir(internalTargetDir, { recursive: true });
			}

			// Export Root CA files
			const rootFiles = ["root_ca.crt", "root_ca.key", "root_ca.srl"];
			await Promise.all(rootFiles.map(async (file) => {
				const srcPath = path.join(internalDir, file);
				const destPath = path.join(internalTargetDir, file);
				if (await dirExists(srcPath)) {
					await fs.promises.copyFile(srcPath, destPath);
					exportedFiles.push(destPath);
				}
			}));

			// Export leaf cert directories (npm-*)
			const items = await fs.promises.readdir(internalDir);
			await pMap(items, async (item) => {
				const itemPath = path.join(internalDir, item);
				const stat = await fs.promises.stat(itemPath);
				if (stat.isDirectory() && item.startsWith("npm-")) {
					const destDir = path.join(internalTargetDir, item);
					if (!(await dirExists(destDir))) {
						await fs.promises.mkdir(destDir, { recursive: true });
					}

					// Copy folder content
					const files = await fs.promises.readdir(itemPath);
					await Promise.all(files.map(async (file) => {
						const srcFile = path.join(itemPath, file);
						const destFile = path.join(destDir, file);
						await fs.promises.copyFile(srcFile, destFile);
						exportedFiles.push(destFile);
					}));
				}
			}, 20);
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

			// Update last sync time
			await settingModel
				.query()
				.where("id", "gitops-config")
				.patch({
					meta: {
						...config,
						last_sync: new Date().toISOString(),
						last_error: null,
					},
				});

			logger.info(`GitOps: Committed and pushed ${sha}`);
			return { success: true, commit: sha };
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Unknown error";
			logger.error("GitOps commit/push failed:", err);

			// Update error state
			await settingModel
				.query()
				.where("id", "gitops-config")
				.patch({
					meta: {
						...config,
						last_error: errorMessage,
					},
				});

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
			await settingModel
				.query()
				.where("id", "gitops-config")
				.patch({
					meta: {
						...config,
						last_sync: new Date().toISOString(),
						last_error: null,
					},
				});

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
		const importModel = async (modelClass, dirName, hostType = null, relationGraph = null) => {
			const dirPath = path.join(configDir, dirName);
			const importedIds = [];

			if (await dirExists(dirPath)) {
				const files = (await fs.promises.readdir(dirPath)).filter((f) => f.endsWith(".yaml"));
				for (const file of files) {
					try {
						const content = await fs.promises.readFile(path.join(dirPath, file), "utf8");
						const data = yaml.load(content);

						if (data && typeof data === "object") {
							const itemData = /** @type {any} */ (data);
							const existingId = itemData.id;

							if (existingId) {
								importedIds.push(existingId);
								const existing = await modelClass.query().findById(existingId);
								if (existing && !options.overwrite) {
									skipped++;
									continue;
								}
							}

							// Ensure item is not marked as deleted upon restore
							itemData.is_deleted = 0;

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
								if (!itemData.owner_user_id) itemData.owner_user_id = access.token.getUserId();

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
				}
			}

			// FULL SYNC: Delete items not in importedIds
			if (options.overwrite) {
				const query = modelClass.query().whereNotIn("id", importedIds);

				try {
					const staleItems = await query;
					for (const item of staleItems) {
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
			await importModel(ProxyHost, "proxy-hosts", "proxy_host");
			await importModel(RedirectionHost, "redirection-hosts", "redirection_host");
			await importModel(DeadHost, "dead-hosts", "dead_host");
			await importModel(Stream, "streams", "stream");
			await importModel(Stream, "streams", "stream");
			await importModel(CloudflaredTunnel, "cloudflared-tunnels");
			await importModel(DdnsProvider, "ddns-providers");

			// 5. Import Settings
			const settingsDir = path.join(configDir, "settings");
			if (await dirExists(settingsDir)) {
				const files = (await fs.promises.readdir(settingsDir)).filter((f) => f.endsWith(".yaml"));
				for (const file of files) {
					try {
						const content = await fs.promises.readFile(path.join(settingsDir, file), "utf8");
						const data = yaml.load(content);
						if (data && typeof data === "object") {
							const settingData = /** @type {any} */ (data);
							if (settingData.id === "gitops-config") continue;

							const existing = await settingModel.query().findById(settingData.id);
							if (existing) {
								await settingModel.query().patchAndFetchById(settingData.id, settingData);
							} else {
								await settingModel.query().insert(settingData);
							}
							imported++;
						}
					} catch (err) {
						errors.push(`settings/${file}: ${err.message}`);
					}
				}
			}

			// 6. Restore Certificate Files
			const certFilesDir = path.join(configDir, "certificate-files");
			if (await dirExists(certFilesDir)) {
				const restoreFile = async (src, dest) => {
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
				};

				// Restore Let's Encrypt
				const leDir = path.join(certFilesDir, "letsencrypt");
				if (await dirExists(leDir)) {
					const domains = await fs.promises.readdir(leDir);
					await Promise.all(domains.map(async (domain) => {
						const srcDir = path.join(leDir, domain);
						const targetDir = path.join("/data/tls/certbot/live", domain);
						if (!(await dirExists(targetDir))) {
							await fs.promises.mkdir(targetDir, { recursive: true });
						}
						const files = await fs.promises.readdir(srcDir);
						await Promise.all(files.map(async (file) => {
							await restoreFile(path.join(srcDir, file), path.join(targetDir, file));
						}));
					}));
				}

				// Restore Custom Certs
				const customDir = path.join(certFilesDir, "custom");
				if (await dirExists(customDir)) {
					const targetDir = "/data/tls/custom";
					if (!(await dirExists(targetDir))) {
						await fs.promises.mkdir(targetDir, { recursive: true });
					}
					const items = await fs.promises.readdir(customDir);
					await Promise.all(items.map(async (item) => {
						const srcPath = path.join(customDir, item);
						const destPath = path.join(targetDir, item);
						const stats = await fs.promises.stat(srcPath);

						if (stats.isFile()) {
							await restoreFile(srcPath, destPath);
						} else if (stats.isDirectory() && item.startsWith("npm-")) {
							if (!(await dirExists(destPath))) {
								await fs.promises.mkdir(destPath, { recursive: true });
							}
							const files = await fs.promises.readdir(srcPath);
							await Promise.all(files.map(async (file) => {
								await restoreFile(path.join(srcPath, file), path.join(destPath, file));
							}));
						}
					}));
				}

				// Restore Internal Certificates
				const internalDir = path.join(certFilesDir, "internal");
				if (await dirExists(internalDir)) {
					const targetBaseDir = "/data/tls/internal";
					if (!(await dirExists(targetBaseDir))) {
						await fs.promises.mkdir(targetBaseDir, { recursive: true });
					}

					const internalItems = await fs.promises.readdir(internalDir);
					await Promise.all(internalItems.map(async (item) => {
						const srcPath = path.join(internalDir, item);
						const destPath = path.join(targetBaseDir, item);
						const stat = await fs.promises.stat(srcPath);

						if (stat.isFile()) {
							await restoreFile(srcPath, destPath);
						} else if (stat.isDirectory() && item.startsWith("npm-")) {
							const destDir = path.join(targetBaseDir, item);
							if (!(await dirExists(destDir))) {
								await fs.promises.mkdir(destDir, { recursive: true });
							}
							const files = await fs.promises.readdir(srcPath);
							await Promise.all(files.map(async (file) => {
								await restoreFile(path.join(srcPath, file), path.join(destDir, file));
							}));
						}
					}));
				}
			}

			// 7. Regenerate Nginx Configs
			await internalNginx.bulkGenerateConfigs(
				ProxyHost,
				"proxy_host",
				await ProxyHost.query().where("is_deleted", 0),
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

export default internalGitOps;
