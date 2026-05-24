import fs from "node:fs";
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
/**
 * Validate Tor service parameters to prevent protocol injection.
 * Tor Control Protocol is line-based (\r\n-separated).
 * Malicious values with \r\n could inject additional commands.
 */
const validateServiceParams = (service) => {
	// Validate virtual_port: must be a valid integer port
	const vPort = Number.parseInt(service.virtual_port, 10);
	if (Number.isNaN(vPort) || vPort < 1 || vPort > 65535) {
		throw new Error(`Invalid virtual_port: ${service.virtual_port}. Must be 1-65535.`);
	}

	// Validate target_port: must be a valid integer port
	const tPort = Number.parseInt(service.target_port, 10);
	if (Number.isNaN(tPort) || tPort < 1 || tPort > 65535) {
		throw new Error(`Invalid target_port: ${service.target_port}. Must be 1-65535.`);
	}

	// Validate private_key: no control characters allowed
	if (service.private_key) {
		if (/[\r\n\0]/.test(service.private_key)) {
			throw new Error("Invalid private_key: control characters not allowed.");
		}
		// Basic format check for ED25519-V3 keys
		if (!/^ED25519-V3:[A-Za-z0-9+/=]+$/.test(service.private_key)) {
			throw new Error("Invalid private_key: malformed ED25519-V3 key.");
		}
	}
};

class TorClient {
	constructor() {
		this.socket = null;
		this.commandQueue = [];
		this.isProcessing = false;
		this.buffer = "";
		this.authenticated = false;
	}

	async getPassword() {
		if (!fs.existsSync(torPasswordFile)) {
			throw new Error("Tor control password file not found");
		}
		return (await fs.promises.readFile(torPasswordFile, "utf-8")).trim();
	}

	connect() {
		if (this.socket && !this.socket.destroyed && this.authenticated) {
			return Promise.resolve();
		}

		if (this.connectPromise) {
			return this.connectPromise;
		}

		this.connectPromise = new Promise((resolve, reject) => {
			let connectTimeout;

			const cleanup = () => {
				clearTimeout(connectTimeout);
				this.connectPromise = null;
			};

			connectTimeout = setTimeout(() => {
				if (this.socket && !this.socket.destroyed) {
					this.socket.destroy();
				}
				cleanup();
				reject(new Error("Tor connection/authentication timeout"));
			}, 10000);

			this.socket = createConnection(torControlPort, torControlHost, async () => {
				try {
					const password = await this.getPassword();
					this.socket.write(`AUTHENTICATE "${password}"\r\n`);
				} catch (err) {
					cleanup();
					this._rejectAll(err);
					reject(err);
				}
			});

			this.authenticated = false;
			this.buffer = "";

			this.socket.on("data", (chunk) => {
				this.buffer += chunk.toString();

				if (!this.authenticated) {
					if (this.buffer.includes("250 OK\r\n")) {
						this.authenticated = true;
						const idx = this.buffer.indexOf("250 OK\r\n") + 8;
						this.buffer = this.buffer.substring(idx);
						cleanup();
						resolve();
						this._processQueue();
					} else if (/(^|\r?\n)5\d\d [^\r\n]*\r?\n/.test(this.buffer)) {
						const err = new Error(`Tor authentication failed: ${this.buffer.trim()}`);
						cleanup();
						this.socket.destroy();
						reject(err);
					}
					return;
				}

				// Check if the command response is complete
				const match = this.buffer.match(/(^|\r?\n)(250 OK|5\d\d [^\r\n]*)\r?\n/);
				if (match) {
					const responseEndIdx = match.index + match[0].length;
					const responseStr = this.buffer.substring(0, responseEndIdx).trim();
					this.buffer = this.buffer.substring(responseEndIdx);

					if (this.commandQueue.length > 0) {
						const { resolve: cmdResolve } = this.commandQueue.shift();
						this.isProcessing = false;
						cmdResolve(responseStr);
						this._processQueue();
					}
				}
			});

			this.socket.on("error", (err) => {
				cleanup();
				this._rejectAll(err);
				reject(err);
			});

			this.socket.on("close", () => {
				cleanup();
				this.socket = null;
				this.authenticated = false;
				this.buffer = "";
				this._rejectAll(new Error("Tor socket closed"));
			});
		});

		return this.connectPromise;
	}

	_rejectAll(err) {
		this.isProcessing = false;
		const queue = [...this.commandQueue];
		this.commandQueue = [];
		for (const req of queue) {
			req.reject(err);
		}
	}

	async _processQueue() {
		if (this.isProcessing || this.commandQueue.length === 0 || !this.socket || this.socket.destroyed) {
			return;
		}

		this.isProcessing = true;
		const { command } = this.commandQueue[0];
		this.socket.write(`${command}\r\n`);
	}

	execute(command) {
		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				const index = this.commandQueue.findIndex((c) => c.resolve === wrappedResolve);
				if (index !== -1) {
					this.commandQueue.splice(index, 1);
					if (index === 0 && this.isProcessing && this.socket) {
						// Command was already sent, socket state is now out of sync.
						// We must destroy the socket so it reconnects for the next commands.
						this.socket.destroy();
					}
					this._processQueue();
				}
				reject(new Error("Tor command timeout"));
			}, 30000);

			const wrappedResolve = (val) => {
				clearTimeout(timeoutId);
				resolve(val);
			};

			const wrappedReject = (err) => {
				clearTimeout(timeoutId);
				reject(err);
			};

			this.commandQueue.push({ command, resolve: wrappedResolve, reject: wrappedReject });

			this.connect()
				.then(() => {
					if (!this.isProcessing) {
						this._processQueue();
					}
				})
				.catch((err) => {
					const index = this.commandQueue.findIndex((c) => c.resolve === wrappedResolve);
					if (index !== -1) {
						this.commandQueue.splice(index, 1);
						wrappedReject(err);
					}
				});
		});
	}
}

const torClient = new TorClient();

/**
 * Authenticates with the Tor Control Port
 * @returns {Promise<boolean>}
 */
const authenticate = async () => {
	try {
		await torClient.connect();
		return true;
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
	return await torClient.execute(command);
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

		// Bulk reset status on boot
		if (services.length > 0) {
			await TorOnion.query().patch({ status: 0 }).where("is_deleted", 0);
		}

		for (const service of services) {
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

			// SECURITY: Validate service params to prevent protocol injection
			validateServiceParams(service);

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

			// SECURITY: Validate service params to prevent protocol injection
			validateServiceParams(service);

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
