import fs from "node:fs";
import path from "node:path";
import git from "isomorphic-git";
// @ts-expect-error - isomorphic-git http module has no type declarations
import http from "isomorphic-git/http/node/index.cjs";
import yaml from "js-yaml";

import { decrypt, encrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import settingModel from "../models/setting.js";
import ProxyHost from "../models/proxy_host.js";
import RedirectionHost from "../models/redirection_host.js";
import DeadHost from "../models/dead_host.js";
import Stream from "../models/stream.js";
import AccessList from "../models/access_list.js";
import Certificate from "../models/certificate.js";
import CloudflaredTunnel from "../models/cloudflared_tunnel.js";
import User from "../models/user.js";
import { global as logger } from "../logger.js";
import { isDemoMode } from "../lib/config.js";


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
 * Ensures the GitOps directory exists
 */
const ensureDir = () => {
    if (!fs.existsSync(GITOPS_DIR)) {
        fs.mkdirSync(GITOPS_DIR, { recursive: true });
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
        ensureDir();
        const configDir = getConfigDir();

        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
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
        const dirs = ["proxy-hosts", "redirection-hosts", "dead-hosts", "streams", "access-lists", "certificates", "users", "settings", "cloudflared-tunnels"];
        for (const dir of dirs) {
            const dirPath = path.join(configDir, dir);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
        }

        // Export Proxy Hosts
        const proxyHosts = await ProxyHost.query().where("is_deleted", 0);
        for (const host of proxyHosts) {
            const filename = `${host.id}-${(host.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
            const filePath = path.join(configDir, "proxy-hosts", filename);
            const exportData = internalGitOps.sanitizeForExport(host, ["is_deleted"]);
            fs.writeFileSync(filePath, yaml.dump(exportData, { indent: 2 }));
            exportedFiles.push(filePath);
        }

        // Export Redirection Hosts
        const redirectionHosts = await RedirectionHost.query().where("is_deleted", 0);
        for (const host of redirectionHosts) {
            const filename = `${host.id}-${(host.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
            const filePath = path.join(configDir, "redirection-hosts", filename);
            const exportData = internalGitOps.sanitizeForExport(host, ["is_deleted"]);
            fs.writeFileSync(filePath, yaml.dump(exportData, { indent: 2 }));
            exportedFiles.push(filePath);
        }

        // Export Dead Hosts
        const deadHosts = await DeadHost.query().where("is_deleted", 0);
        for (const host of deadHosts) {
            const filename = `${host.id}-${(host.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
            const filePath = path.join(configDir, "dead-hosts", filename);
            const exportData = internalGitOps.sanitizeForExport(host, ["is_deleted"]);
            fs.writeFileSync(filePath, yaml.dump(exportData, { indent: 2 }));
            exportedFiles.push(filePath);
        }

        // Export Streams
        const streams = await Stream.query().where("is_deleted", 0);
        for (const stream of streams) {
            const filename = `${stream.id}-${stream.incoming_port || "unknown"}.yaml`;
            const filePath = path.join(configDir, "streams", filename);
            const exportData = internalGitOps.sanitizeForExport(stream, ["is_deleted"]);
            fs.writeFileSync(filePath, yaml.dump(exportData, { indent: 2 }));
            exportedFiles.push(filePath);
        }

        // Export Access Lists (with items and clients - including hashed passwords)
        const accessLists = await AccessList.query()
            .where("is_deleted", 0)
            .withGraphFetched("[items, clients]");
        for (const list of accessLists) {
            const filename = `${list.id}-${(list.name || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
            const filePath = path.join(configDir, "access-lists", filename);
            const exportData = internalGitOps.sanitizeForExport(list, ["is_deleted"]);
            // Keep hashed passwords for full restore capability
            fs.writeFileSync(filePath, yaml.dump(exportData, { indent: 2 }));
            exportedFiles.push(filePath);
        }

        // Export Certificates (database entries only, not the actual cert files)
        const certificates = await Certificate.query().where("is_deleted", 0);
        for (const cert of certificates) {
            const filename = `${cert.id}-${(cert.nice_name || cert.domain_names?.[0] || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
            const filePath = path.join(configDir, "certificates", filename);
            const exportData = internalGitOps.sanitizeForExport(cert, ["is_deleted"]);
            fs.writeFileSync(filePath, yaml.dump(exportData, { indent: 2 }));
            exportedFiles.push(filePath);
        }

        // Export Users (with permissions, excluding password hashes for security)
        const users = await User.query()
            .where("is_deleted", 0)
            .withGraphFetched("permissions");
        for (const user of users) {
            const filename = `${user.id}-${(user.nickname || user.email || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
            const filePath = path.join(configDir, "users", filename);
            const exportData = internalGitOps.sanitizeForExport(user, ["is_deleted"]);
            fs.writeFileSync(filePath, yaml.dump(exportData, { indent: 2 }));
            exportedFiles.push(filePath);
        }

        // Export Settings (excluding gitops-config to avoid overwriting credentials)
        const settings = await settingModel.query().whereNot("id", "gitops-config");
        for (const setting of settings) {
            const filename = `${setting.id}.yaml`;
            const filePath = path.join(configDir, "settings", filename);
            const exportData = { ...setting };
            fs.writeFileSync(filePath, yaml.dump(exportData, { indent: 2 }));
            exportedFiles.push(filePath);
        }

        // Export Cloudflared Tunnels (including decrypted tokens for restore)
        const cloudflaredDir = path.join(configDir, "cloudflared-tunnels");
        if (!fs.existsSync(cloudflaredDir)) {
            fs.mkdirSync(cloudflaredDir, { recursive: true });
        }
        const tunnels = await CloudflaredTunnel.query().where("is_deleted", 0);
        for (const tunnel of tunnels) {
            const filename = `${tunnel.id}-${(tunnel.name || "unknown").replace(/[^a-z0-9.-]/gi, "-")}.yaml`;
            const filePath = path.join(cloudflaredDir, filename);
            // Token is already decrypted by the model's $parseDatabaseJson
            const exportData = internalGitOps.sanitizeForExport(tunnel, ["is_deleted"]);
            fs.writeFileSync(filePath, yaml.dump(exportData, { indent: 2 }));
            exportedFiles.push(filePath);
        }

        // Copy certificate files if they exist
        await internalGitOps.exportCertificateFiles(configDir, exportedFiles);

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
            fs.mkdirSync(certFilesDir, { recursive: true });
        }

        // Export Let's Encrypt certificates
        const letsencryptDir = "/data/tls/certbot/live";
        if (fs.existsSync(letsencryptDir)) {
            const domains = fs.readdirSync(letsencryptDir).filter(d => !d.startsWith("."));
            for (const domain of domains) {
                const domainDir = path.join(letsencryptDir, domain);
                const targetDir = path.join(certFilesDir, "letsencrypt", domain);
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
                // Copy cert files
                const certFiles = ["fullchain.pem", "privkey.pem", "cert.pem", "chain.pem"];
                for (const file of certFiles) {
                    const srcPath = path.join(domainDir, file);
                    const destPath = path.join(targetDir, file);
                    if (fs.existsSync(srcPath)) {
                        fs.copyFileSync(srcPath, destPath);
                        exportedFiles.push(destPath);
                    }
                }
            }
        }

        // Export custom certificates
        const customDir = "/data/tls/custom";
        if (fs.existsSync(customDir)) {
            const files = fs.readdirSync(customDir);
            const customTargetDir = path.join(certFilesDir, "custom");
            if (!fs.existsSync(customTargetDir)) {
                fs.mkdirSync(customTargetDir, { recursive: true });
            }
            for (const file of files) {
                const srcPath = path.join(customDir, file);
                const destPath = path.join(customTargetDir, file);
                if (fs.statSync(srcPath).isFile()) {
                    fs.copyFileSync(srcPath, destPath);
                    exportedFiles.push(destPath);
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

            // Update last sync time
            await settingModel.query().where("id", "gitops-config").patch({
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
            await settingModel.query().where("id", "gitops-config").patch({
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
            await settingModel.query().where("id", "gitops-config").patch({
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
     * @param {string} sha
     * @returns {Promise<{success: boolean, message?: string}>}
     */
    revertToCommit: async (sha) => {
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
            return { success: true, message: `Reverted to ${sha}` };
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
     * @returns {Promise<{success: boolean, imported: number, skipped: number, errors: string[]}>}
     */
    importConfig: async (access, options = {}) => {
        if (isDemoMode()) {
            throw new errs.AuthError("GitOps is disabled in Demo Mode");
        }

        await access.can("settings:update", "gitops-config");

        const configDir = getConfigDir();
        let imported = 0;
        let skipped = 0;
        const errors = [];

        // Helper to import standard models
        const importModel = async (modelClass, dirName, relationGraph = null) => {
            const dirPath = path.join(configDir, dirName);
            if (!fs.existsSync(dirPath)) return;

            const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".yaml"));
            for (const file of files) {
                try {
                    const content = fs.readFileSync(path.join(dirPath, file), "utf8");
                    const data = yaml.load(content);

                    if (data && typeof data === "object") {
                        const itemData = /** @type {any} */ (data);
                        const existingId = itemData.id;

                        if (existingId) {
                            const existing = await modelClass.query().findById(existingId);
                            if (existing && !options.overwrite) {
                                skipped++;
                                continue;
                            }
                        }

                        // Ensure owner_user_id is valid (fallback to current admin if missing)
                        if (itemData.owner_user_id) {
                            // Check if user exists, if not set to current user to avoid constraint error
                            // But wait, we import users later? No, we should import users FIRST.
                        }

                        if (options.overwrite && existingId) {
                            // Use upsertGraph for complex models (AccessList), patch/insert for simple
                            if (relationGraph) {
                                await modelClass.query().upsertGraph(itemData, {
                                    insertMissing: true,
                                    relate: true,
                                    update: true,
                                    noDelete: false // Delete missing children (items/clients)
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
                            // Set owner to current user for new imports if not strictly restoring
                            if (!itemData.owner_user_id) itemData.owner_user_id = access.token.getUserId();

                            if (relationGraph) {
                                await modelClass.query().insertGraph(itemData);
                            } else {
                                await modelClass.query().insert(itemData);
                            }
                        }
                        imported++;
                    }
                } catch (err) {
                    logger.error(`Import failed for ${dirName}/${file}:`, err);
                    errors.push(`${dirName}/${file}: ${err instanceof Error ? err.message : "Unknown error"}`);
                }
            }
        };

        try {
            // 1. Import Users first (to satisfy foreign keys)
            await importModel(User, "users", "permissions");

            // 2. Import Certificates (DB)
            await importModel(Certificate, "certificates");

            // 3. Import Access Lists (with items and clients)
            await importModel(AccessList, "access-lists", "[items, clients]");

            // 4. Import Hosts & Streams
            await importModel(ProxyHost, "proxy-hosts");
            await importModel(RedirectionHost, "redirection-hosts");
            await importModel(DeadHost, "dead-hosts");
            await importModel(Stream, "streams");
            await importModel(CloudflaredTunnel, "cloudflared-tunnels");

            // 5. Import Settings (excluding gitops-config)
            const settingsDir = path.join(configDir, "settings");
            if (fs.existsSync(settingsDir)) {
                const files = fs.readdirSync(settingsDir).filter((f) => f.endsWith(".yaml"));
                for (const file of files) {
                    try {
                        const content = fs.readFileSync(path.join(settingsDir, file), "utf8");
                        const data = yaml.load(content);
                        if (data && typeof data === "object") {
                            const settingData = /** @type {any} */ (data);
                            // Skip GitOps config to avoid overwriting credentials/repo url with old data
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
            if (fs.existsSync(certFilesDir)) {
                // Restore Let's Encrypt
                const leDir = path.join(certFilesDir, "letsencrypt");
                if (fs.existsSync(leDir)) {
                    const domains = fs.readdirSync(leDir);
                    for (const domain of domains) {
                        const srcDir = path.join(leDir, domain);
                        const targetDir = path.join("/data/tls/certbot/live", domain);
                        if (!fs.existsSync(targetDir)) {
                            fs.mkdirSync(targetDir, { recursive: true });
                        }
                        const files = fs.readdirSync(srcDir);
                        for (const file of files) {
                            fs.copyFileSync(path.join(srcDir, file), path.join(targetDir, file));
                        }
                        // We also need to ensure archive dir exists for certbot structure? 
                        // Simplified: ShieldPM mostly cares about 'live'.
                    }
                }

                // Restore Custom Certs
                const customDir = path.join(certFilesDir, "custom");
                if (fs.existsSync(customDir)) {
                    const targetDir = "/data/tls/custom";
                    if (!fs.existsSync(targetDir)) {
                        fs.mkdirSync(targetDir, { recursive: true });
                    }
                    const files = fs.readdirSync(customDir);
                    for (const file of files) {
                        fs.copyFileSync(path.join(customDir, file), path.join(targetDir, file));
                    }
                }
            }

            logger.info(`GitOps import: ${imported} imported, ${skipped} skipped, ${errors.length} errors`);
            return { success: true, imported, skipped, errors };
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Unknown error";
            logger.error("GitOps import failed:", err);
            return { success: false, imported, skipped, errors: [...errors, errorMessage] };
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

