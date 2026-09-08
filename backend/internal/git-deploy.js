/**
 * Git Deploy Service
 * Handles automatic Git synchronization for path-based proxy hosts
 */

import fs from "node:fs";
import path from "node:path";
import dayjs from "dayjs";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import { isDemoMode } from "../lib/config.js";
import { decrypt, encrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import { global as logger } from "../logger.js";
import ProxyHost from "../models/proxy_host.js";
import internalNginx from "./nginx.js";

const WEBSITES_DIR = "/data/websites";

/** @type {Map<number, any>} */
const pollingTimers = new Map();
const activeSyncs = new Map();

/** Resolve hosts within the caller's current visibility before reading or changing deployment state. */
const getAuthorizedHost = async (access, hostId, permission) => {
	const accessData = access ? await access.can(permission, hostId) : true;
	const query = ProxyHost.query().findById(hostId).where("is_deleted", 0);
	if (accessData !== true && accessData?.permission_visibility !== "all") {
		query.where("owner_user_id", access.token.getUserId(1));
	}
	const host = await query;
	if (!host) throw new errs.ItemNotFoundError(hostId);
	return host;
};

/**
 * Ensures the websites directory exists
 * @param {number} hostId
 * @returns {string} The website directory path
 */
const getWebsiteDir = (hostId) => {
	const dir = path.join(WEBSITES_DIR, `host-${hostId}`);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	return dir;
};

/**
 * Creates authentication object for git operations
 * @param {string|null} encryptedCredentials
 * @returns {Object}
 */
const getAuth = (encryptedCredentials) => {
	if (!encryptedCredentials) {
		return {};
	}

	try {
		const credentials = decrypt(encryptedCredentials);
		return {
			onAuth: () => ({
				username: "git",
				password: credentials,
			}),
		};
	} catch (err) {
		logger.error("Failed to decrypt Git credentials:", err);
		return {};
	}
};

/**
 * Convert poll interval to milliseconds
 * @param {number} interval
 * @param {string} unit - 's' (seconds), 'm' (minutes), 'h' (hours)
 * @returns {number}
 */
const intervalToMs = (interval, unit) => {
	switch (unit) {
		case "s":
			return interval * 1000;
		case "m":
			return interval * 60 * 1000;
		case "h":
			return interval * 60 * 60 * 1000;
		default:
			return interval * 60 * 1000; // Default to minutes
	}
};

const internalGitDeploy = {
	/**
	 * Sync a proxy host from its Git repository
	 * @param {import("../lib/types.js").Access | null | undefined} access
	 * @param {number} hostId
	 * @returns {Promise<{success: boolean, commit?: string, message?: string}>}
	 */
	sync: async (access, hostId) => {
		if (isDemoMode()) {
			throw new errs.AuthError("Git Deploy is disabled in Demo Mode");
		}

		const host = await getAuthorizedHost(access, hostId, "proxy_hosts:update");

		if (host.forward_scheme !== "path") {
			throw new errs.ValidationError("Git Deploy is only available for path-based proxy hosts");
		}

		if (!host.git_repo_url) {
			throw new errs.ValidationError("Git repository URL not configured");
		}

		if (activeSyncs.has(hostId)) return activeSyncs.get(hostId);
		const syncTask = (async () => {
			const dir = getWebsiteDir(hostId);
			const gitDir = path.join(dir, ".git");
			let stagingDir = null;

			try {
				logger.info(
					`[git-deploy] Starting sync for host ${hostId} (Repo: ${host.git_repo_url}, Branch: ${host.git_branch || "main"})`,
				);

				// Check if repo already exists
				let repoExists = fs.existsSync(gitDir);
				logger.debug(`[git-deploy] Host ${hostId}: Repo exists? ${repoExists}`);

				if (repoExists) {
					// Check for branch mismatch
					const currentBranch = await git.currentBranch({ fs, dir });
					const targetBranch = host.git_branch || "main";
					const currentRemote = await git.getConfig({ fs, dir, path: "remote.origin.url" });

					logger.debug(
						`[git-deploy] Host ${hostId}: Current branch: ${currentBranch}, Target: ${targetBranch}`,
					);

					if (currentBranch !== targetBranch || currentRemote !== host.git_repo_url) {
						logger.info(
							`[git-deploy] Branch changed from '${currentBranch}' to '${targetBranch}' for host ${hostId}. Re-cloning...`,
						);
						// Keep the published checkout intact until its replacement is complete.
						stagingDir = fs.mkdtempSync(`${dir}.clone-`);
						repoExists = false; // Mark as not existing so we clone
					}
				}

				// Check if repo exists (it might have been deleted above)
				if (repoExists) {
					// Pull latest changes
					logger.info(`[git-deploy] Pulling updates for host ${hostId}...`);

					await git.pull({
						fs,
						http,
						dir,
						ref: host.git_branch || "main",
						singleBranch: true,
						author: {
							name: "ShieldPM GitDeploy",
							email: "gitdeploy@shieldpm.local",
						},
						...getAuth(host.git_credentials),
					});
				} else {
					// Clone repository
					logger.info(`[git-deploy] Cloning ${host.git_repo_url} for host ${hostId}...`);

					await git.clone({
						fs,
						http,
						dir: stagingDir || dir,
						url: host.git_repo_url,
						ref: host.git_branch || "main",
						singleBranch: true,
						depth: 1, // Shallow clone for efficiency
						...getAuth(host.git_credentials),
					});
				}

				// Finish asynchronous Git reads before validating the configuration for publication.
				const commits = await git.log({ fs, dir: stagingDir || dir, depth: 1 });
				const latestCommit = commits[0]?.oid || null;

				// Git operations can outlive a host deletion or a configuration change.
				const currentHost = await ProxyHost.query().findById(hostId).where("is_deleted", 0);
				if (
					currentHost?.forward_scheme !== "path" ||
					currentHost.git_repo_url !== host.git_repo_url ||
					(currentHost.git_branch || "main") !== (host.git_branch || "main") ||
					currentHost.git_credentials !== host.git_credentials
				) {
					return {
						success: false,
						message:
							"Host Git configuration changed during synchronization; retry with the current configuration",
					};
				}

				if (stagingDir) {
					const previousDir = `${stagingDir}.previous`;
					// mkdtemp is private while cloning; preserve the published root's worker-readable mode.
					fs.chmodSync(stagingDir, fs.statSync(dir).mode & 0o777);
					fs.renameSync(dir, previousDir);
					try {
						fs.renameSync(stagingDir, dir);
					} catch (err) {
						fs.renameSync(previousDir, dir);
						throw err;
					}
					stagingDir = null;
					try {
						fs.rmSync(previousDir, { recursive: true, force: true });
					} catch (err) {
						logger.error(`[git-deploy] Could not remove previous checkout for host ${hostId}:`, err);
					}
				}

				// Update host status

				await ProxyHost.query()
					.findById(hostId)
					.patch({
						git_last_sync: dayjs().format("YYYY-MM-DD HH:mm:ss"),
						git_last_commit: latestCommit,
						git_last_error: null,
					});

				// Update forward_host to point to the website directory
				if (currentHost.forward_host !== dir) {
					await ProxyHost.query().findById(hostId).patch({
						forward_host: dir,
					});

					// Trigger Nginx reload to apply the new root path
					const updatedHost = await ProxyHost.query()
						.findById(hostId)
						.withGraphFetched("[host_domains, certificate, access_list.[items,clients]]");
					await internalNginx.configure(ProxyHost, "proxy_host", updatedHost);

					logger.info(`[git-deploy] Updated forward_host for host ${hostId} to ${dir} and reloaded Nginx`);
				}

				logger.info(`[git-deploy] Sync complete for host ${hostId}, commit: ${latestCommit}`);
				return { success: true, commit: latestCommit };
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : "Unknown error";
				logger.error(`[git-deploy] Sync failed for host ${hostId}:`, err);

				// Update error state

				await ProxyHost.query().findById(hostId).where("is_deleted", 0).patch({
					git_last_error: errorMessage,
				});

				return { success: false, message: errorMessage };
			} finally {
				if (stagingDir) {
					try {
						fs.rmSync(stagingDir, { recursive: true, force: true });
					} catch (err) {
						logger.error(`[git-deploy] Could not remove incomplete checkout for host ${hostId}:`, err);
					}
				}
			}
		})().finally(() => activeSyncs.delete(hostId));
		activeSyncs.set(hostId, syncTask);
		return syncTask;
	},

	/**
	 * Get sync status for a proxy host
	 * @param {import("../lib/types.js").Access | null | undefined} access
	 * @param {number} hostId
	 * @returns {Promise<Object>}
	 */
	getStatus: async (access, hostId) => {
		const host = await getAuthorizedHost(access, hostId, "proxy_hosts:get");

		return {
			git_repo_url: host.git_repo_url,
			git_branch: host.git_branch,
			git_sync_enabled: host.git_sync_enabled,
			git_poll_interval: host.git_poll_interval,
			git_poll_unit: host.git_poll_unit,
			git_last_sync: host.git_last_sync,
			git_last_commit: host.git_last_commit,
			git_last_error: host.git_last_error,
			polling_active: pollingTimers.has(hostId),
		};
	},

	/**
	 * Update Git configuration for a proxy host
	 * @param {import("../lib/types.js").Access} access
	 * @param {number} hostId
	 * @param {Object} data
	 * @returns {Promise<Object>}
	 */
	updateConfig: async (access, hostId, data) => {
		if (isDemoMode()) {
			throw new errs.AuthError("Git Deploy is disabled in Demo Mode");
		}

		const host = await getAuthorizedHost(access, hostId, "proxy_hosts:update");

		if (host.forward_scheme !== "path") {
			throw new errs.ValidationError("Git Deploy is only available for path-based proxy hosts");
		}

		const updateData = {};

		if (data.git_repo_url !== undefined) {
			updateData.git_repo_url = data.git_repo_url || null;
		}
		if (data.git_branch !== undefined) {
			updateData.git_branch = data.git_branch || "main";
		}
		if (data.git_sync_enabled !== undefined) {
			updateData.git_sync_enabled = data.git_sync_enabled;
		}
		if (data.git_poll_interval !== undefined) {
			// The timer applies the ten-second minimum after converting the selected unit.
			updateData.git_poll_interval = data.git_poll_interval;
		}
		if (data.git_poll_unit !== undefined) {
			if (["s", "m", "h"].includes(data.git_poll_unit)) {
				updateData.git_poll_unit = data.git_poll_unit;
			}
		}

		// Encrypt credentials if provided
		if (data.git_credentials) {
			updateData.git_credentials = encrypt(data.git_credentials);
		} else if (data.git_credentials === "") {
			// Empty string means clear credentials
			updateData.git_credentials = null;
		}

		await ProxyHost.query().findById(hostId).patch(updateData);

		// Restart polling if enabled
		if (
			updateData.git_sync_enabled !== undefined ||
			updateData.git_poll_interval !== undefined ||
			updateData.git_poll_unit !== undefined ||
			updateData.git_repo_url !== undefined
		) {
			const updatedHost = await ProxyHost.query().findById(hostId).where("is_deleted", 0);
			if (updatedHost.git_sync_enabled && updatedHost.git_repo_url) {
				internalGitDeploy.startPollingForHost(updatedHost);
			} else {
				internalGitDeploy.stopPolling(hostId);
			}
		}

		logger.info(`[git-deploy] Config updated for host ${hostId}`);
		return internalGitDeploy.getStatus(access, hostId);
	},

	/**
	 * Start polling for all enabled hosts
	 */
	startPolling: async () => {
		if (isDemoMode()) {
			logger.debug("[git-deploy] Demo mode - polling disabled");
			return;
		}

		try {
			const hosts = await ProxyHost.query()
				.where("is_deleted", 0)
				.where("forward_scheme", "path")
				.where("git_sync_enabled", true)
				.whereNotNull("git_repo_url");

			logger.info(`[git-deploy] Starting polling for ${hosts.length} hosts`);

			for (const host of hosts) {
				internalGitDeploy.startPollingForHost(host);
			}
		} catch (err) {
			logger.error("[git-deploy] Failed to start polling:", err);
		}
	},

	/**
	 * Start polling for a specific host
	 * @param {Object} host
	 */
	startPollingForHost: (host) => {
		// Stop existing timer if any
		internalGitDeploy.stopPolling(host.id);

		if (!host.git_sync_enabled || !host.git_repo_url) {
			return;
		}

		const configuredInterval = intervalToMs(host.git_poll_interval, host.git_poll_unit);
		const intervalMs = Number.isFinite(configuredInterval)
			? Math.min(2147483647, Math.max(10000, configuredInterval))
			: 60000;

		logger.info(
			`[git-deploy] Starting polling for host ${host.id} every ${host.git_poll_interval}${host.git_poll_unit}`,
		);

		const timer = setInterval(async () => {
			try {
				await internalGitDeploy.sync(null, host.id);
			} catch (err) {
				logger.error(`[git-deploy] Polling sync failed for host ${host.id}:`, err);
			}
		}, intervalMs);

		pollingTimers.set(host.id, timer);

		// Trigger immediate sync
		internalGitDeploy.sync(null, host.id).catch((err) => {
			logger.error(`[git-deploy] Initial sync failed for host ${host.id}:`, err);
		});
	},

	/**
	 * Stop polling for a specific host
	 * @param {number} hostId
	 */
	stopPolling: (hostId) => {
		const timer = pollingTimers.get(hostId);
		if (timer) {
			clearInterval(timer);
			pollingTimers.delete(hostId);
			logger.debug(`[git-deploy] Stopped polling for host ${hostId}`);
		}
	},

	/**
	 * Stop all polling timers
	 */
	stopAllPolling: () => {
		for (const [hostId, timer] of pollingTimers) {
			clearInterval(timer);
			logger.debug(`[git-deploy] Stopped polling for host ${hostId}`);
		}
		pollingTimers.clear();
	},

	/**
	 * Initialize the service (called on startup)
	 */
	init: async () => {
		if (isDemoMode()) {
			logger.debug("[git-deploy] Demo mode - service disabled");
			return;
		}

		// Ensure websites directory exists
		if (!fs.existsSync(WEBSITES_DIR)) {
			fs.mkdirSync(WEBSITES_DIR, { recursive: true });
		}

		// Start polling for all enabled hosts
		await internalGitDeploy.startPolling();
	},
};

export default internalGitDeploy;
