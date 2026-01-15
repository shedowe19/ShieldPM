import { spawn } from "child_process";
import { global as logger } from "../logger.js";
import CloudflaredTunnel from "../models/cloudflared_tunnel.js";

const processes = new Map();

const internalCloudflared = {
	/**
	 * Initialize all tunnels
	 */
	init: async () => {
		logger.info("Initializing Cloudflared Tunnels...");
		const tunnels = await CloudflaredTunnel.query();
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

			processes.set(tunnel.id, child);

			child.stdout.on("data", (data) => {
				logger.debug(`[Cloudflared ${tunnel.id}] ${data}`);
			});

			child.stderr.on("data", (data) => {
				// Cloudflared logs to stderr mostly
				logger.info(`[Cloudflared ${tunnel.id}] ${data}`);
			});

			child.on("exit", (code, signal) => {
				logger.warn(`Cloudflared Tunnel ${tunnel.id} exited with code ${code} / signal ${signal}`);
				processes.delete(tunnel.id);
				tunnel
					.$query()
					.patch({ status: 0 })
					.then()
					.catch(() => { }); // Set to stopped
			});

			// Assume running if no immediate exit?
			// Cloudflared doesn't really signal "ready" easily via simple spawn without parsing logs.
			// We'll set to 2 (Running) immediately.
			await tunnel.$query().patch({ status: 2 });
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
		const child = processes.get(tunnelId);
		if (child) {
			logger.info(`Stopping Cloudflared Tunnel: ${tunnelId}`);
			child.kill("SIGTERM");
			processes.delete(tunnelId);
			// Status update is handled by 'exit' listener, but we can force it here too to be sure
			await CloudflaredTunnel.query().findById(tunnelId).patch({ status: 0 });
		}
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
