import { spawn } from "node:child_process";
import { global as logger } from "../logger.js";
import CloudflaredTunnel from "../models/cloudflared_tunnel.js";

const processes = new Map();
const CHILD_STOP_TIMEOUT_MS = 5_000;

const withTimeout = (promise, milliseconds, message) =>
	new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(message)), milliseconds);
		timer.unref?.();
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});

const internalCloudflared = {
	/**
	 * Initialize all tunnels
	 */
	init: async () => {
		logger.info("Initializing Cloudflared Tunnels...");
		const tunnels = await CloudflaredTunnel.query().where("is_deleted", 0);
		for (const tunnel of tunnels) {
			// Reset status to stopped on boot, then start
			await /** @type {any} */ (tunnel).$query().patch({ status: 0 });
			internalCloudflared.start(tunnel);
		}
	},

	/**
	 * Start a tunnel
	 * @param {CloudflaredTunnel} tunnel
	 */
	start: async (tunnel) => {
		if (processes.has(tunnel.id)) {
			await internalCloudflared.stop(tunnel.id);
		}

		logger.info(`Starting Cloudflared Tunnel: ${tunnel.name} (${tunnel.id})`);
		await /** @type {any} */ (tunnel).$query().patch({ status: 1 }); // Starting

		try {
			const child = spawn("/usr/local/bin/cloudflared", ["tunnel", "run"], {
				stdio: ["ignore", "pipe", "pipe"],
				detached: false,
				env: {
					...process.env,
					TUNNEL_TOKEN: tunnel.token,
				},
			});

			let errorLog = "";
			let settleExit;
			const exitSettled = new Promise((resolve) => {
				settleExit = resolve;
			});
			processes.set(tunnel.id, { child, exitSettled });

			child.stdout.on("data", (data) => {
				const str = data.toString();
				logger.debug(`[Cloudflared ${tunnel.id}] ${str}`);
				// Capture stdout too, sometimes errors are there
				errorLog = (errorLog + str).slice(-2000);
			});

			child.stderr.on("data", (data) => {
				// Cloudflared logs to stderr mostly
				const str = data.toString();
				logger.info(`[Cloudflared ${tunnel.id}] ${str}`);
				// Capture last ~2000 chars of error log
				errorLog = (errorLog + str).slice(-2000);
			});

			child.once("close", async (code, signal) => {
				logger.warn(`Cloudflared Tunnel ${tunnel.id} exited with code ${code} / signal ${signal}`);
				if (processes.get(tunnel.id)?.child === child) processes.delete(tunnel.id);

				// Determine status based on exit code
				// 0 = Stopped (Clean exit)
				// Anything else = Error
				const newStatus = code === 0 || code === null ? 0 : 3;

				// Update status and meta.last_error if error
				const patchData = { status: newStatus };
				const meta = { ...tunnel.meta };

				if (newStatus === 3 && errorLog) {
					logger.info(`[Cloudflared ${tunnel.id}] Saving error log to DB: ${errorLog.length} chars`);
					meta.last_error = errorLog.trim();
				} else {
					// Clear error on clean exit or restart
					delete meta.last_error;
				}
				patchData.meta = meta;

				try {
					await tunnel.$query().patch(patchData);
					logger.info(`[Cloudflared ${tunnel.id}] Updated status to ${newStatus}`);
				} catch (err) {
					logger.error(`[Cloudflared ${tunnel.id}] Failed to update status:`, err);
				} finally {
					settleExit();
				}
			});

			// Wait 2 seconds to ensure the process is stable
			await new Promise((resolve) => setTimeout(resolve, 2000));

			if (processes.has(tunnel.id)) {
				// Still running after 2 seconds, mark as Online
				// clear any previous error
				const meta = { ...tunnel.meta };
				delete meta.last_error;

				await tunnel.$query().patch({ status: 2, meta });
			}
		} catch (err) {
			logger.error(`Failed to start Cloudflared Tunnel ${tunnel.id}:`, err);
			await tunnel.$query().patch({ status: 3 }); // Error
		}
	},

	/**
	 * Stop a tunnel
	 * @param {number} tunnelId
	 */
	stop: async (tunnelId) => {
		const processEntry = processes.get(tunnelId);
		if (processEntry) {
			logger.info(`Stopping Cloudflared Tunnel: ${tunnelId}`);
			processEntry.child.kill("SIGTERM");
			try {
				await withTimeout(
					processEntry.exitSettled,
					CHILD_STOP_TIMEOUT_MS,
					`Cloudflared ${tunnelId} did not stop`,
				);
			} catch (error) {
				processEntry.child.kill("SIGKILL");
				await withTimeout(
					processEntry.exitSettled,
					CHILD_STOP_TIMEOUT_MS,
					`Cloudflared ${tunnelId} did not exit after SIGKILL`,
				);
				logger.warn(error.message);
			}
		}
	},

	stopAll: async () => {
		const results = await Promise.allSettled(
			[...processes.keys()].map((tunnelId) => internalCloudflared.stop(tunnelId)),
		);
		const failed = results.find((result) => result.status === "rejected");
		if (failed) throw failed.reason;
	},

	/**
	 * Restart a tunnel
	 * @param {CloudflaredTunnel} tunnel
	 */
	restart: async (tunnel) => {
		await internalCloudflared.stop(tunnel.id);
		// Wait a bit?
		await new Promise((resolve) => setTimeout(resolve, 1000));
		await internalCloudflared.start(tunnel);
	},
};

export default internalCloudflared;
