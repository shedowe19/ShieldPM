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
const activeSyncs = new Set();
let stopping = false;

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
		if (stopping && !access) return { success: false, message: "Git deploy is shutting down" };
		let finishSync;
		const syncSettled = new Promise((resolve) => {
			finishSync = resolve;
		});
		activeSyncs.add(syncSettled);
		try {
			if (access) {
				await access.can("proxy_hosts:update", hostId);
			}

			if (isDemoMode()) {
				throw new errs.AuthError("Git Deploy is disabled in Demo Mode");
			}

			const host = await ProxyHost.query().findById(hostId);
			if (!host) {
				throw new errs.ItemNotFoundError(hostId);
			}

			if (host.forward_scheme !== "path") {
				throw new errs.ValidationError("Git Deploy is only available for path-based proxy hosts");
			}

			if (!host.git_repo_url) {
				throw new errs.ValidationError("Git repository URL not configured");
			}

			const dir = getWebsiteDir(hostId);
			const gitDir = path.join(dir, ".git");

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

					logger.debug(
						`[git-deploy] Host ${hostId}: Current branch: ${currentBranch}, Target: ${targetBranch}`,
					);

					if (currentBranch !== targetBranch) {
						logger.info(
							`[git-deploy] Branch changed from '${currentBranch}' to '${targetBranch}' for host ${hostId}. Re-cloning...`,
						);
						fs.rmSync(dir, { recursive: true, force: true });
						fs.mkdirSync(dir, { recursive: true });
						repoExists = false; // Mark as not existing so we clone
					}
				}

				// Check if repo exists (it might have been deleted above)
				if (fs.existsSync(gitDir)) {
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
						dir,
						url: host.git_repo_url,
						ref: host.git_branch || "main",
						singleBranch: true,
						depth: 1, // Shallow clone for efficiency
						...getAuth(host.git_credentials),
					});
				}

				// Get current commit SHA
				const commits = await git.log({ fs, dir, depth: 1 });
				const latestCommit = commits[0]?.oid || null;

				// Update host status

				await ProxyHost.query()
					.findById(hostId)
					.patch({
						git_last_sync: dayjs().format("YYYY-MM-DD HH:mm:ss"),
						git_last_commit: latestCommit,
						git_last_error: null,
					});

				// Update forward_host to point to the website directory
				if (host.forward_host !== dir) {
					await ProxyHost.query().findById(hostId).patch({
						forward_host: dir,
					});

					// Trigger Nginx reload to apply the new root path
					const updatedHost = await ProxyHost.query().findById(hostId).withGraphFetched("access_list");
					await internalNginx.configure(ProxyHost, "proxy_host", updatedHost);

					logger.info(`[git-deploy] Updated forward_host for host ${hostId} to ${dir} and reloaded Nginx`);
				}

				logger.info(`[git-deploy] Sync complete for host ${hostId}, commit: ${latestCommit}`);
				return { success: true, commit: latestCommit };
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : "Unknown error";
				logger.error(`[git-deploy] Sync failed for host ${hostId}:`, err);

				// Update error state

				await ProxyHost.query().findById(hostId).patch({
					git_last_error: errorMessage,
				});

				return { success: false, message: errorMessage };
			}
		} finally {
			finishSync();
			activeSyncs.delete(syncSettled);
		}
	},

	/**
	 * Get sync status for a proxy host
	 * @param {import("../lib/types.js").Access | null | undefined} access
	 * @param {number} hostId
	 * @returns {Promise<Object>}
	 */
	getStatus: async (access, hostId) => {
		if (access) {
			await access.can("proxy_hosts:get", hostId);
		}

		const host = await ProxyHost.query().findById(hostId);
		if (!host) {
			throw new errs.ItemNotFoundError(hostId);
		}

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

		await access.can("proxy_hosts:update", hostId);

		const host = await ProxyHost.query().findById(hostId);
		if (!host) {
			throw new errs.ItemNotFoundError(hostId);
		}

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
			// Enforce minimum of 10 seconds
			updateData.git_poll_interval = Math.max(10, data.git_poll_interval);
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
			updateData.git_poll_unit !== undefined
		) {
			const updatedHost = await ProxyHost.query().findById(hostId);
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

		const intervalMs = intervalToMs(host.git_poll_interval, host.git_poll_unit);

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
	stopAllPolling: async () => {
		stopping = true;
		for (const [hostId, timer] of pollingTimers) {
			clearInterval(timer);
			logger.debug(`[git-deploy] Stopped polling for host ${hostId}`);
		}
		pollingTimers.clear();
		await Promise.allSettled([...activeSyncs]);
	},

	/**
	 * Initialize the service (called on startup)
	 */
	init: async () => {
		stopping = false;
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
