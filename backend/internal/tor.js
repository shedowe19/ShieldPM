import fs from "node:fs/promises";
import { createConnection } from "node:net";
import { global as logger } from "../logger.js";
import ProxyHost from "../models/proxy_host.js";
import TorOnion from "../models/tor_onion.js";
import internalGitOps from "./gitops.js";
import internalNginx from "./nginx.js";

const dataPath = process.env.DATA_PATH || "/data";
const torControlHost = "127.0.0.1";
const torControlPort = 9051;
const torPasswordFile = `${dataPath}/shieldpm/tor-control-password`;

/**
 * Sends a command to Tor Control Port and returns the response
 * @param {string} command
 * @returns {Promise<string>}
 */
const sendCommand = (command) => {
	return new Promise((resolve, reject) => {
		const socket = createConnection(torControlPort, torControlHost, () => {
			socket.write(`${command}\r\n`);
		});

		let data = "";
		socket.on("data", (chunk) => {
			data += chunk.toString();
			// Check if we have a complete response (ends with 250 or 5xx)
			if (/^(250|5\d\d) /m.test(data)) {
				socket.end();
			}
		});

		socket.on("end", () => {
			resolve(data);
		});

		socket.on("error", (err) => {
			reject(err);
		});

		// Timeout after 10 seconds
		socket.setTimeout(10000, () => {
			socket.destroy();
			reject(new Error("Tor control port connection timeout"));
		});
	});
};

/**
 * Authenticates with the Tor Control Port
 * @returns {Promise<boolean>}
 */
const authenticate = async () => {
	try {
		try {
			await fs.access(torPasswordFile);
		} catch {
			logger.warn("Tor control password file not found, Tor may not be running");
			return false;
		}

		const password = (await fs.readFile(torPasswordFile, "utf-8")).trim();
		const response = await sendCommand(`AUTHENTICATE "${password}"`);

		if (response.includes("250 OK")) {
			return true;
		}
		logger.error("Tor authentication failed:", response);
		return false;
	} catch (err) {
		logger.debug("Tor control port not available:", err.message);
		return false;
	}
};

/**
 * Sends an authenticated command to Tor
 * @param {string} command
 * @returns {Promise<string>}
 */
const sendAuthenticatedCommand = async (command) => {
	try {
		await fs.access(torPasswordFile);
	} catch {
		throw new Error("Tor control password file not found");
	}

	const password = (await fs.readFile(torPasswordFile, "utf-8")).trim();

	return new Promise((resolve, reject) => {
		const socket = createConnection(torControlPort, torControlHost, () => {
			// First authenticate
			socket.write(`AUTHENTICATE "${password}"\r\n`);
		});

		let authenticated = false;
		let data = "";

		socket.on("data", (chunk) => {
			data += chunk.toString();

			if (!authenticated && data.includes("250 OK")) {
				authenticated = true;
				data = ""; // Reset for command response
				socket.write(`${command}\r\n`);
				return;
			}

			// Check if command response is complete
			if (authenticated && (/^250 OK/m.test(data) || /^5\d\d /m.test(data))) {
				socket.end();
			}
		});

		socket.on("end", () => {
			if (!authenticated) {
				reject(new Error("Tor authentication failed"));
				return;
			}
			resolve(data);
		});

		socket.on("error", (err) => {
			reject(err);
		});

		socket.setTimeout(30000, () => {
			socket.destroy();
			reject(new Error("Tor command timeout"));
		});
	});
};

/**
 * Syncs the onion address to the Proxy Host's domain_names
 * @param {TorOnion} service
 * @param {boolean} [skip_reload=false]
 * @returns {Promise<void>}
 */
const syncProxyHost = async (service, skip_reload = false) => {
	if (!service.proxy_host_id || !service.onion_address) {
		return;
	}

	try {
		const proxyHost = await ProxyHost.query().findById(service.proxy_host_id).where("is_deleted", 0);
		if (!proxyHost) {
			return;
		}

		// Check if onion address is already in domain_names
		if (proxyHost.domain_names.includes(service.onion_address)) {
			return;
		}

		// Add onion address
		const newDomains = [...proxyHost.domain_names, service.onion_address];

		// Update Proxy Host in DB
		await ProxyHost.query().patchAndFetchById(proxyHost.id, {
			domain_names: newDomains,
		});

		// Reconfigure Nginx
		// We fetch the updated row to be sure
		const updatedHost = await ProxyHost.query().findById(proxyHost.id);
		await internalNginx.configure(ProxyHost, "proxy_host", updatedHost, { skip_reload });

		logger.info(`Added onion address ${service.onion_address} to Proxy Host ${proxyHost.id}`);
		internalGitOps.triggerAutoPush("onion-sync");
	} catch (err) {
		logger.error(`Failed to sync onion address to Proxy Host: ${err.message}`);
	}
};

const internalTor = {
	/**
	 * Check if Tor is available
	 * @returns {Promise<boolean>}
	 */
	isAvailable: async () => {
		try {
			return await authenticate();
		} catch {
			return false;
		}
	},

	/**
	 * Initialize all onion services on startup
	 */
	init: async () => {
		logger.info("Initializing Tor Onion Services...");

		let attempts = 0;
		const maxAttempts = 30; // Wait up to 30 seconds

		while (attempts < maxAttempts) {
			if (await internalTor.isAvailable()) {
				break;
			}
			attempts++;
			if (attempts >= maxAttempts) {
				logger.warn("Tor is not available after 30s, skipping onion service initialization");
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		const services = await TorOnion.query().where("is_deleted", 0);
		for (const service of services) {
			// Reset status on boot
			await /** @type {any} */ (service).$query().patch({ status: 0 });

			// Re-add services that have a private key
			if (service.private_key && service.onion_address) {
				await internalTor.start(service, true); // skip_reload for batch processing
			}
		}

		// Reload Nginx once after initialization
		try {
			await internalNginx.reload();
		} catch (err) {
			logger.error("Failed to reload Nginx after Tor initialization", err);
		}
	},

	/**
	 * Create a new Onion Service
	 * @param {TorOnion} service
	 * @returns {Promise<{onionAddress: string, privateKey: string} | null>}
	 */
	create: async (service) => {
		logger.info(`Creating Tor Onion Service: ${service.name} (${service.id})`);

		try {
			await service.$query().patch({ status: 1 }); // Starting

			// Create new onion service with ED25519-V3 key
			const command = `ADD_ONION NEW:ED25519-V3 Flags=Detach Port=${service.virtual_port},127.0.0.1:${service.target_port}`;
			const response = await sendAuthenticatedCommand(command);

			logger.debug("Tor ADD_ONION response:", response);

			// Parse response for ServiceID and PrivateKey
			const serviceIdMatch = response.match(/ServiceID=([a-z2-7]{56})/i);
			const privateKeyMatch = response.match(/PrivateKey=(ED25519-V3:[^\s]+)/);

			if (!serviceIdMatch || !privateKeyMatch) {
				logger.error("Failed to parse Tor response:", response);
				await service.$query().patch({ status: 3 }); // Error
				return null;
			}

			const onionAddress = `${serviceIdMatch[1]}.onion`;
			const privateKey = privateKeyMatch[1];

			// Update database with onion address and private key
			await service.$query().patch({
				onion_address: onionAddress,
				private_key: privateKey,
				status: 2, // Running
			});

			logger.info(`Tor Onion Service created: ${onionAddress}`);

			// Sync with Proxy Host
			await syncProxyHost(await TorOnion.query().findById(service.id));

			return { onionAddress, privateKey };
		} catch (err) {
			logger.error(`Failed to create Tor Onion Service ${service.id}:`, err);
			await service.$query().patch({ status: 3 }); // Error
			return null;
		}
	},

	/**
	 * Start an existing Onion Service (re-add with stored private key)
	 * @param {TorOnion} service
	 * @param {boolean} [skip_reload=false]
	 * @returns {Promise<boolean>}
	 */
	start: async (service, skip_reload = false) => {
		if (!service.private_key || !service.onion_address) {
			logger.warn(`Cannot start Tor Onion Service ${service.id}: missing private key or address`);
			return false;
		}

		logger.info(`Starting Tor Onion Service: ${service.name} (${service.onion_address})`);

		try {
			await service.$query().patch({ status: 1 }); // Starting

			// Re-add onion service with existing private key
			const command = `ADD_ONION ${service.private_key} Flags=Detach Port=${service.virtual_port},127.0.0.1:${service.target_port}`;
			const response = await sendAuthenticatedCommand(command);

			if (response.includes("250 OK") || response.includes("ServiceID=")) {
				await service.$query().patch({ status: 2 }); // Running
				logger.info(`Tor Onion Service started: ${service.onion_address}`);

				// Sync with Proxy Host
				await syncProxyHost(service, skip_reload);

				return true;
			}

			logger.error("Failed to start Tor Onion Service:", response);
			await service.$query().patch({ status: 3 }); // Error
			return false;
		} catch (err) {
			logger.error(`Failed to start Tor Onion Service ${service.id}:`, err);
			await service.$query().patch({ status: 3 }); // Error
			return false;
		}
	},

	/**
	 * Stop an Onion Service
	 * @param {TorOnion} service
	 * @returns {Promise<boolean>}
	 */
	stop: async (service) => {
		if (!service.onion_address) {
			return true;
		}

		logger.info(`Stopping Tor Onion Service: ${service.onion_address}`);

		try {
			// Extract service ID from .onion address
			const serviceId = service.onion_address.replace(".onion", "");
			const command = `DEL_ONION ${serviceId}`;
			const response = await sendAuthenticatedCommand(command);

			if (response.includes("250 OK")) {
				await service.$query().patch({ status: 0 }); // Stopped
				logger.info(`Tor Onion Service stopped: ${service.onion_address}`);
				return true;
			}

			logger.warn("Unexpected response when stopping Tor Onion Service:", response);
			await service.$query().patch({ status: 0 }); // Assume stopped
			return true;
		} catch (err) {
			logger.error(`Failed to stop Tor Onion Service ${service.id}:`, err);
			// Still mark as stopped since we can't verify
			await service.$query().patch({ status: 0 });
			return false;
		}
	},

	/**
	 * Delete an Onion Service (stop and remove from database)
	 * @param {number} serviceId
	 * @returns {Promise<boolean>}
	 */
	delete: async (serviceId) => {
		const service = await TorOnion.query().findById(serviceId);
		if (!service) {
			return false;
		}

		// Stop the service first
		await internalTor.stop(service);

		// Delete from database
		await service.$query().delete();
		logger.info(`Tor Onion Service deleted: ${serviceId}`);
		return true;
	},

	/**
	 * Restart an Onion Service
	 * @param {TorOnion} service
	 * @returns {Promise<boolean>}
	 */
	restart: async (service) => {
		await internalTor.stop(service);
		await new Promise((resolve) => setTimeout(resolve, 500));
		return await internalTor.start(service);
	},

	/**
	 * Get Tor daemon info
	 * @returns {Promise<Object|null>}
	 */
	getInfo: async () => {
		try {
			const response = await sendAuthenticatedCommand("GETINFO version");
			const versionMatch = response.match(/version=([\d.]+)/);

			return {
				available: true,
				version: versionMatch ? versionMatch[1] : "unknown",
			};
		} catch {
			return {
				available: false,
				version: null,
			};
		}
	},
};

export default internalTor;
