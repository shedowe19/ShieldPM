import { spawn } from "node:child_process";
import { global as logger } from "../logger.js";
import CloudflaredTunnel from "../models/cloudflared_tunnel.js";

const processes = new Map();
const operations = new Map();
const serialize = (id, operation) => {
	const key = String(id);
	const pending = (operations.get(key) || Promise.resolve()).catch(() => {}).then(operation);
	operations.set(key, pending);
	pending
		.finally(() => {
			if (operations.get(key) === pending) operations.delete(key);
		})
		.catch(() => {});
	return pending;
};

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
			internalCloudflared.start(tunnel).catch((err) => logger.error("Failed to initialize tunnel", err));
		}
	},

	/**
	 * Start a tunnel
	 * @param {CloudflaredTunnel} tunnel
	 */
	start: (snapshot) =>
		serialize(snapshot.id, async () => {
			const tunnel = await CloudflaredTunnel.query().findById(snapshot.id).where("is_deleted", 0);
			if (tunnel) await internalCloudflared._start(tunnel);
		}),

	_start: async (tunnel) => {
		const processId = String(tunnel.id);
		if (processes.has(processId)) {
			await internalCloudflared._stop(tunnel.id);
		}

		logger.info(`Starting Cloudflared Tunnel: ${tunnel.name} (${tunnel.id})`);
		try {
			await /** @type {any} */ (tunnel).$query().patch({ status: 1 }); // Starting
			const child = spawn("/usr/local/bin/cloudflared", ["tunnel", "run"], {
				stdio: ["ignore", "pipe", "pipe"],
				detached: false,
				env: {
					...process.env,
					TUNNEL_TOKEN: tunnel.token,
				},
			});

			processes.set(processId, child);

			let errorLog = "";
			child.on("error", (err) => {
				if (processes.get(processId) !== child) return;
				processes.delete(processId);
				logger.error(`Cloudflared Tunnel ${tunnel.id} failed:`, err);
				tunnel
					.$query()
					.patch({ status: 3, meta: { ...tunnel.meta, last_error: err.message } })
					.catch((patchError) => logger.error("Failed to save tunnel error", patchError));
			});

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

			child.on("exit", (code, signal) => {
				// A stopped child can exit after its replacement has already started.
				if (processes.get(processId) !== child) return;
				logger.warn(`Cloudflared Tunnel ${tunnel.id} exited with code ${code} / signal ${signal}`);
				processes.delete(processId);

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

				tunnel
					.$query()
					.patch(patchData)
					.then(() => {
						logger.info(`[Cloudflared ${tunnel.id}] Updated status to ${newStatus}`);
					})
					.catch((err) => {
						logger.error(`[Cloudflared ${tunnel.id}] Failed to update status:`, err);
					});
			});

			// Wait 2 seconds to ensure the process is stable
			await new Promise((resolve) => setTimeout(resolve, 2000));

			if (processes.get(processId) === child) {
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
	stop: (tunnelId) => serialize(tunnelId, () => internalCloudflared._stop(tunnelId)),

	_stop: async (tunnelId) => {
		const processId = String(tunnelId);
		const child = processes.get(processId);
		if (child) {
			logger.info(`Stopping Cloudflared Tunnel: ${tunnelId}`);
			child.kill("SIGTERM");
			processes.delete(processId);
			// Status update is handled by 'exit' listener, but we can force it here too to be sure
			await CloudflaredTunnel.query().findById(tunnelId).patch({ status: 0 });
		}
	},

	/**
	 * Restart a tunnel
	 * @param {CloudflaredTunnel} tunnel
	 */
	restart: (snapshot) =>
		serialize(snapshot.id, async () => {
			await internalCloudflared._stop(snapshot.id);
			await new Promise((resolve) => setTimeout(resolve, 1000));
			const tunnel = await CloudflaredTunnel.query().findById(snapshot.id).where("is_deleted", 0);
			if (tunnel) await internalCloudflared._start(tunnel);
		}),

	/** Stop and remove the record in one lifecycle operation before queued restarts can proceed. */
	delete: (tunnelId) =>
		serialize(tunnelId, async () => {
			await internalCloudflared._stop(tunnelId);
			const tunnel = await CloudflaredTunnel.query().findById(tunnelId).where("is_deleted", 0);
			if (!tunnel) return false;
			await tunnel.$query().delete();
			return true;
		}),
};

export default internalCloudflared;
