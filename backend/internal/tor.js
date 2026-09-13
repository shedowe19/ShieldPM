import fs from "node:fs";
import { createConnection } from "node:net";
import errs from "../lib/error.js";
import { global as logger } from "../logger.js";
import ProxyHost from "../models/proxy_host.js";
import TorOnion from "../models/tor_onion.js";
import internalAnubis from "./anubis.js";
import internalGitOps from "./gitops.js";
import internalNginx from "./nginx.js";
import internalOAuth2Proxy from "./oauth2-proxy.js";

const dataPath = process.env.DATA_PATH || "/data";
const torControlHost = "127.0.0.1";
const torControlPort = 9051;
const torPasswordFile = `${dataPath}/shieldpm/tor-control-password`;
const serviceOperations = new Map();

// Keep detached Tor identities and their database records in the same lifecycle order.
const withServiceLock = (id, operation) => {
	const key = String(id);
	const previous = serviceOperations.get(key) || Promise.resolve();
	const pending = previous.catch(() => {}).then(operation);
	serviceOperations.set(key, pending);
	return pending.finally(() => {
		if (serviceOperations.get(key) === pending) serviceOperations.delete(key);
	});
};

const currentService = (id) => TorOnion.query().findById(id).where("is_deleted", 0);

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
	const vPort = Number(service.virtual_port);
	if (!/^\d+$/.test(String(service.virtual_port)) || !Number.isInteger(vPort) || vPort < 1 || vPort > 65535) {
		throw new errs.ValidationError("Invalid virtual_port. Must be an integer from 1 to 65535.");
	}

	// Validate target_port: must be a valid integer port
	const tPort = Number(service.target_port);
	if (!/^\d+$/.test(String(service.target_port)) || !Number.isInteger(tPort) || tPort < 1 || tPort > 65535) {
		throw new errs.ValidationError("Invalid target_port. Must be an integer from 1 to 65535.");
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
		if (!fs.existsSync(torPasswordFile)) {
			logger.warn("Tor control password file not found, Tor may not be running");
			return false;
		}

		const password = (await fs.promises.readFile(torPasswordFile, "utf-8")).trim();
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
	if (!fs.existsSync(torPasswordFile)) {
		throw new Error("Tor control password file not found");
	}

	const password = (await fs.promises.readFile(torPasswordFile, "utf-8")).trim();

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
 * @param {TorOnion} serviceSnapshot
 * @param {boolean} [skip_reload=false]
 * @returns {Promise<void>}
 */
const syncProxyHost = async (serviceSnapshot, skip_reload = false) => {
	try {
		await internalNginx.withConfigurationLock(async () => {
			// A Tor response can arrive after the service has been reassigned or deleted.
			const service = await TorOnion.query().findById(serviceSnapshot.id).where("is_deleted", 0);
			if (!service?.proxy_host_id || !service.onion_address) return;
			const proxyHost = await ProxyHost.query()
				.findById(service.proxy_host_id)
				.where("is_deleted", 0)
				.withGraphFetched("host_domains");
			if (!proxyHost) {
				return;
			}

			// Check if onion address is already in domain_names
			if (proxyHost.domain_names.includes(service.onion_address)) {
				return;
			}

			await proxyHost.$relatedQuery("host_domains").insert({ domain_name: service.onion_address });

			// Reconfigure Nginx
			// We fetch the updated row to be sure
			const updatedHost = await ProxyHost.query()
				.findById(proxyHost.id)
				.withGraphFetched("[host_domains, certificate, access_list.[clients,items]]");
			await internalNginx.configureHost(ProxyHost, "proxy_host", updatedHost, { skip_reload });

			logger.info(`Added onion address ${service.onion_address} to Proxy Host ${proxyHost.id}`);
			internalGitOps.triggerAutoPush("onion-sync");
		});
	} catch (err) {
		logger.error(`Failed to sync onion address to Proxy Host: ${err.message}`);
	}
};

const internalTor = {
	create: (snapshot) =>
		withServiceLock(snapshot.id, async () => {
			const service = await currentService(snapshot.id);
			if (!service) return null;
			// Another request may have created the identity while this caller was waiting.
			if (service.private_key && service.onion_address) {
				if (service.status !== 2 && !(await internalTor._start(service))) return null;
				return { onionAddress: service.onion_address, privateKey: service.private_key };
			}
			return internalTor._create(service);
		}),

	start: (snapshot, skip_reload = false) =>
		withServiceLock(snapshot.id, async () => {
			const service = await currentService(snapshot.id);
			if (!service) return false;
			if (service.status === 2) return true;
			return internalTor._start(service, skip_reload);
		}),

	stop: (snapshot) =>
		withServiceLock(snapshot.id, async () => {
			const service = await currentService(snapshot.id);
			return service ? internalTor._stop(service) : true;
		}),

	/**
	 * Atomically update a service and move its onion domain between authorized hosts.
	 * Both Nginx configs remain recoverable until the database transaction commits.
	 * @param {import("../lib/types.js").Access} access
	 * @param {TorOnion} service
	 * @param {Object} payload
	 * @returns {Promise<TorOnion>}
	 */
	update: async (access, service, payload) => {
		const permission = await access.can("tor_onions:update", service.id);
		const changedHosts = [];
		const updated = await internalNginx.withConfigurationLock(async () => {
			// Access.can may itself query the DB; resolve it before taking a transaction connection.
			const currentQuery = TorOnion.query().findById(service.id).where("is_deleted", 0);
			if (permission.permission_visibility !== "all")
				currentQuery.where("owner_user_id", access.token.getUserId(1));
			const snapshot = await currentQuery;
			if (!snapshot) throw new errs.ItemNotFoundError(service.id);
			const requestedHostId =
				payload.proxy_host_id === undefined ? snapshot.proxy_host_id : payload.proxy_host_id;
			const hostPermissions = new Map();
			for (const id of new Set([snapshot.proxy_host_id, requestedHostId].filter(Boolean))) {
				hostPermissions.set(id, await access.can("proxy_hosts:update", id));
			}
			const backups = [];
			let result;
			try {
				result = await TorOnion.transaction(async (trx) => {
					const query = TorOnion.query(trx).findById(service.id).where("is_deleted", 0);
					if (permission.permission_visibility !== "all")
						query.where("owner_user_id", access.token.getUserId(1));
					const current = await query;
					if (!current) throw new errs.ItemNotFoundError(service.id);
					if ((current.proxy_host_id || 0) !== (snapshot.proxy_host_id || 0)) {
						throw new errs.ValidationError("The onion service changed; reload it before updating");
					}
					const next = { ...current, ...payload };
					validateServiceParams(next);
					const oldId = current.proxy_host_id || 0;
					const newId = next.proxy_host_id || 0;
					const hosts = new Map();
					for (const id of new Set([oldId, newId].filter(Boolean))) {
						const hostPermission = hostPermissions.get(id);
						const hostQuery = ProxyHost.query(trx)
							.findById(id)
							.where("is_deleted", 0)
							.withGraphFetched("[host_domains, certificate, access_list.[clients,items]]");
						if (hostPermission.permission_visibility !== "all")
							hostQuery.where("owner_user_id", access.token.getUserId(1));
						const host = await hostQuery;
						if (!host) throw new errs.ItemNotFoundError(id);
						hosts.set(id, host);
					}
					if (oldId !== newId && current.onion_address) {
						const oldHost = hosts.get(oldId);
						const newHost = hosts.get(newId);
						if (oldHost) {
							const remaining = oldHost.domain_names.filter((name) => name !== current.onion_address);
							if (!remaining.length)
								throw new errs.ValidationError(
									"The previous proxy host must retain at least one domain",
								);
							await oldHost
								.$relatedQuery("host_domains", trx)
								.delete()
								.where("domain_name", current.onion_address);
						}
						if (newHost && !newHost.domain_names.includes(current.onion_address)) {
							await newHost
								.$relatedQuery("host_domains", trx)
								.insert({ domain_name: current.onion_address });
						}
						for (const id of hosts.keys()) {
							const host = await ProxyHost.query(trx)
								.findById(id)
								.withGraphFetched("[host_domains, certificate, access_list.[clients,items]]");
							await internalNginx.backupConfig("proxy_host", host);
							backups.push(host);
							await internalNginx.generateConfig("proxy_host", host);
							await host.$query(trx).patch({
								meta: { ...host.meta, nginx_online: Boolean(host.enabled), nginx_err: null },
							});
							changedHosts.push(host);
						}
					}
					const record = await current.$query(trx).patchAndFetch(payload);
					if (changedHosts.length) await internalNginx.reload();
					return record;
				});
			} catch (err) {
				// Roll back both files, including newly created configs without a backup.
				const failures = [];
				for (const host of backups) {
					try {
						await internalNginx.deleteConfig("proxy_host", host);
						await internalNginx.restoreConfig("proxy_host", host);
					} catch (restoreError) {
						failures.push(restoreError);
					}
				}
				if (backups.length) {
					try {
						await internalNginx.reload();
					} catch (reloadError) {
						failures.push(reloadError);
					}
				}
				if (failures.length)
					throw new errs.InternalError(
						"Tor host reassignment rollback failed",
						new AggregateError([err, ...failures]),
					);
				throw err;
			}
			for (const host of backups) {
				try {
					await internalNginx.deleteBackupConfig("proxy_host", host);
				} catch (err) {
					logger.error(`Unable to remove Tor host config backup: ${err.message}`);
				}
			}
			return result;
		});
		if (changedHosts.length) {
			const lists = new Map(
				changedHosts.filter((host) => host.access_list).map((host) => [host.access_list.id, host.access_list]),
			);
			for (const list of lists.values()) {
				if ((list.meta?.auth_type || list.meta?.authType) === "oauth2_proxy") {
					try {
						await internalOAuth2Proxy.start(list);
					} catch (err) {
						logger.error(`Tor OAuth2 redirect refresh failed: ${err.message}`);
					}
				}
			}
			Promise.resolve(internalAnubis.generatePolicy()).catch((err) =>
				logger.error(`Tor Anubis policy refresh failed: ${err.message}`),
			);
			internalGitOps.triggerAutoPush("onion-sync");
		}
		return updated;
	},

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
			await internalNginx.withConfigurationLock(() => internalNginx.reload());
		} catch (err) {
			logger.error("Failed to reload Nginx after Tor initialization", err);
		}
	},

	/**
	 * Create a new Onion Service
	 * @param {TorOnion} service
	 * @returns {Promise<{onionAddress: string, privateKey: string} | null>}
	 */
	_create: async (service) => {
		logger.info(`Creating Tor Onion Service: ${service.name} (${service.id})`);

		try {
			await service.$query().patch({ status: 1 }); // Starting

			// SECURITY: Validate service params to prevent protocol injection
			validateServiceParams(service);

			// Create new onion service with ED25519-V3 key
			const command = `ADD_ONION NEW:ED25519-V3 Flags=Detach Port=${service.virtual_port},127.0.0.1:${service.target_port}`;
			const response = await sendAuthenticatedCommand(command);

			// Parse response for ServiceID and PrivateKey
			const serviceIdMatch = response.match(/ServiceID=([a-z2-7]{56})/i);
			const privateKeyMatch = response.match(/PrivateKey=(ED25519-V3:[^\s]+)/);

			if (!serviceIdMatch || !privateKeyMatch) {
				logger.error("Failed to parse Tor ADD_ONION response");
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
	_start: async (service, skip_reload = false) => {
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
	_stop: async (service) => {
		if (!service.onion_address) {
			return true;
		}

		logger.info(`Stopping Tor Onion Service: ${service.onion_address}`);

		try {
			// Extract service ID from .onion address
			if (!/^[a-z2-7]{56}\.onion$/i.test(service.onion_address)) {
				throw new errs.ValidationError("Invalid onion address");
			}
			const serviceId = service.onion_address.replace(".onion", "");
			const command = `DEL_ONION ${serviceId}`;
			const response = await sendAuthenticatedCommand(command);

			if (response.includes("250 OK")) {
				await service.$query().patch({ status: 0 }); // Stopped
				logger.info(`Tor Onion Service stopped: ${service.onion_address}`);
				return true;
			}

			// Tor reports an already absent service with 552; other failures must remain visible.
			if (/^552 /m.test(response)) {
				await service.$query().patch({ status: 0 });
				return true;
			}
			throw new Error("Tor refused to stop the onion service");
		} catch (err) {
			logger.error(`Failed to stop Tor Onion Service ${service.id}:`, err);
			await service.$query().patch({ status: 3 });
			return false;
		}
	},

	/**
	 * Delete an Onion Service (stop and remove from database)
	 * @param {number} serviceId
	 * @returns {Promise<boolean>}
	 */
	delete: (serviceId, { soft = false } = {}) =>
		withServiceLock(serviceId, async () => {
			const service = await currentService(serviceId);
			if (!service) return false;
			if (!(await internalTor._stop(service))) throw new errs.ValidationError("Unable to stop onion service");
			if (soft) await service.$query().patch({ is_deleted: 1 });
			else await service.$query().delete();
			logger.info(`Tor Onion Service deleted: ${serviceId}`);
			return true;
		}),

	/**
	 * Restart an Onion Service
	 * @param {TorOnion} snapshot
	 * @returns {Promise<boolean>}
	 */
	restart: (snapshot) =>
		withServiceLock(snapshot.id, async () => {
			const service = await currentService(snapshot.id);
			if (!service || !(await internalTor._stop(service))) return false;
			await new Promise((resolve) => setTimeout(resolve, 500));
			const updated = await currentService(snapshot.id);
			return updated ? internalTor._start(updated) : false;
		}),

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
