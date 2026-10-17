import Docker from "dockerode";
import { SYSTEM_USER_ID } from "../lib/constants.js";
import errs from "../lib/error.js";
import { withHostDomainClaims } from "../lib/host-domain-claims.js";
import { notifyProxyHostDomainsChanged } from "../lib/proxy-host-domain-events.js";
import { global as logger } from "../logger.js";
import ProxyHost from "../models/proxy_host.js";
import internalCertificate from "./certificate.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";
import internalProxyHostMonitor from "./proxy-host-monitor.js";

const LOCAL_DOCKER_SOCKET = "/var/run/docker.sock";
const CONNECTION_WARNING_INTERVAL = 300000;

/**
 * @typedef {Object} AccessToken
 * @property {() => number} getUserId
 */

/**
 * @typedef {Object} Access
 * @property {AccessToken} token
 * @property {() => Promise<any>} can
 */

/**
 * Mock Access Object for internal system operations
 * @type {import("../lib/types.js").Access}
 */
const mockAccess = {
	token: {
		getUserId: () => SYSTEM_USER_ID,
		// @ts-expect-error
		getScope: () => [],
		get: () => null,
		hasScope: () => true,
	},
	can: () => Promise.resolve({ permission_visibility: "all" }),
};

class DockerService {
	constructor() {
		this.clients = [];
		this.initialized = false;
		this.initializationPromise = null;
		this.pendingHostIds = new Set();
		this.stopped = false;
		this.generation = 0;
	}

	async init() {
		if (this.initialized) return;
		if (this.initializationPromise) return this.initializationPromise;
		this.stopped = false;
		this.initializationPromise = this.initialize();
		try {
			await this.initializationPromise;
		} finally {
			this.initializationPromise = null;
		}
	}

	async initialize() {
		const generation = ++this.generation;
		try {
			for (const client of this.clients) {
				clearTimeout(client.reconnectTimer);
				const stream = client.stream;
				client.stream = null;
				client.watching = false;
				stream?.destroy();
			}
			this.clients = [];

			const hosts = [
				...new Set(
					(process.env.DOCKER_HOSTS || "")
						.split(",")
						.map((host) => host.trim())
						.filter(Boolean),
				),
			];
			// Native/LXC and the default compose deployment need no local Docker daemon.
			// Keep probing it so discovery recovers if the socket is mounted later.
			this.addClient(LOCAL_DOCKER_SOCKET, !hosts.includes(LOCAL_DOCKER_SOCKET));
			for (const host of hosts) {
				if (host !== LOCAL_DOCKER_SOCKET) this.addClient(host);
			}

			if (this.clients.length === 0) {
				logger.warn("Docker Auto-Discovery: No docker hosts configured.");
				return;
			}

			// Initialize all clients
			for (const clientObj of this.clients) {
				try {
					await clientObj.docker.ping();
					if (this.stopped || generation !== this.generation) return;
					clientObj.isConnected = true;
					logger.info(`Docker Auto-Discovery: Connected to ${clientObj.name}`);
				} catch (err) {
					if (this.stopped || generation !== this.generation) return;
					this.connectionFailed(clientObj, err, "Could not connect");
					this.scheduleReconnect(clientObj);
				}
			}

			// Initial Sync
			await this.sync();
			if (this.stopped || generation !== this.generation) return;

			// Start Watching
			await this.watch();
			if (this.stopped || generation !== this.generation) return;
			this.initialized = this.clients.some((client) => client.isConnected);
		} catch (err) {
			if (!this.stopped && generation === this.generation) {
				logger.warn("Docker Auto-Discovery: Initialization failed.", err.message);
			}
		}
	}

	/**
	 * Helper to add a docker client
	 * @param {string} hostString - e.g. "tcp://1.2.3.4:2375" or "/var/run/docker.sock"
	 * @param {boolean} [isOptionalLocal] - Whether the default local socket was added implicitly.
	 */
	addClient(hostString, isOptionalLocal = false) {
		let docker;
		let hostIp = "127.0.0.1";
		let isRemote = false;
		let name = hostString;

		if (hostString.startsWith("tcp://") || hostString.startsWith("http://") || hostString.startsWith("https://")) {
			// Remote
			try {
				const url = new URL(hostString);
				hostIp = url.hostname;
				isRemote = true;

				const dockerConfig = {
					host: url.hostname,
					port: url.port || 2375,
					protocol: /** @type {"http"|"https"|"ssh"} */ (url.protocol.replace(":", "")),
				};

				if (url.protocol === "tcp:") {
					dockerConfig.protocol = "http";
				}

				docker = new Docker(dockerConfig);
			} catch (e) {
				logger.error(`Docker Auto-Discovery: Invalid host URL ${hostString}`, e);
				return;
			}
		} else {
			// Local Socket
			docker = new Docker({ socketPath: hostString });
			name = hostString === LOCAL_DOCKER_SOCKET ? "Local Socket" : `Socket ${hostString}`;
		}

		this.clients.push({
			docker,
			hostIp,
			isRemote,
			name,
			isOptionalLocal,
			isConnected: false,
		});
	}

	/**
	 * Syncs all currently running containers across all clients
	 */
	async createHostIndex() {
		const hosts = await ProxyHost.query().where("is_deleted", 0).withGraphFetched("host_domains");
		const index = { byContainer: new Map(), byDomain: new Map(), manualDomains: new Map() };
		for (const host of hosts) this.indexHost(index, host);
		return index;
	}

	indexHost(index, host) {
		for (const map of [index.byContainer, index.byDomain, index.manualDomains]) {
			for (const [key, value] of map) if (value.id === host.id) map.delete(key);
		}
		if (host.meta?.auto_discovered) index.byContainer.set(host.meta.docker_container_id, host);
		for (const domain of host.domain_names || host.host_domains?.map((row) => row.domain_name) || []) {
			(host.meta?.auto_discovered ? index.byDomain : index.manualDomains).set(domain, host);
		}
	}

	async syncClient(client, index) {
		const containers = await client.docker.listContainers();
		logger.info(`Docker Auto-Discovery [${client.name}]: Syncing ${containers.length} running containers`);
		// A single indexed snapshot bounds host graph reads independently of the container count.
		// Writes still claim domains through the authoritative database path.
		for (const container of containers) {
			if (this.stopped) break;
			await this.processContainer(container, client, index);
		}
	}

	async sync() {
		let index;
		for (const client of this.clients) {
			if (!client.isConnected) continue;
			try {
				index ||= await this.createHostIndex();
				await this.syncClient(client, index);
			} catch (err) {
				logger.error(`Docker Auto-Discovery [${client.name}]: Sync failed`, err);
			}
		}
	}

	/**
	 * Report changed connection failures while keeping an unconfigured, absent local daemon optional.
	 * @param {Object} client
	 * @param {Object} error
	 * @param {string} phase
	 * @param {boolean} [isTransportFailure]
	 */
	connectionFailed(client, error, phase, isTransportFailure = true) {
		client.isConnected = false;
		client.optionalSocketMissing = isTransportFailure && client.isOptionalLocal && error.code === "ENOENT";
		const key = `${client.optionalSocketMissing ? "optional" : "required"}:${error.code || ""}:${error.message}`;
		const previous = client.lastConnectionFailure;
		const now = Date.now();
		if (
			previous?.key === key &&
			(client.optionalSocketMissing || now - previous.loggedAt < CONNECTION_WARNING_INTERVAL)
		) {
			return;
		}
		client.lastConnectionFailure = { key, loggedAt: now };
		if (client.optionalSocketMissing) {
			logger.info(
				`Docker Auto-Discovery [${client.name}]: Optional local socket is unavailable; discovery will retry automatically.`,
			);
		} else {
			logger.warn(`Docker Auto-Discovery [${client.name}]: ${phase}: ${error.message}`);
		}
	}

	scheduleReconnect(client) {
		if (this.stopped) return;
		client.isConnected = false;
		if (client.reconnectTimer || client.reconnecting) return;
		const generation = this.generation;
		const optionalMissing = client.optionalSocketMissing;
		const attemptKey = optionalMissing ? "optionalSocketAttempts" : "reconnectAttempts";
		const delay = optionalMissing
			? Math.min(300000, 30000 * 2 ** Math.min(client[attemptKey] || 0, 4))
			: Math.min(30000, 1000 * 2 ** Math.min(client[attemptKey] || 0, 5));
		client[attemptKey] = (client[attemptKey] || 0) + 1;
		client.reconnectTimer = setTimeout(async () => {
			client.reconnectTimer = null;
			if (this.stopped || generation !== this.generation) return;
			client.reconnecting = true;
			let isTransportFailure = true;
			try {
				await client.docker.ping();
				if (this.stopped || generation !== this.generation) return;
				isTransportFailure = false;
				client.isConnected = true;
				await this.syncClient(client, await this.createHostIndex());
				if (this.stopped || generation !== this.generation) return;
				this.watchClient(client);
			} catch (error) {
				if (!this.stopped && generation === this.generation) {
					this.connectionFailed(client, error, "Reconnect failed", isTransportFailure);
				}
			} finally {
				client.reconnecting = false;
				if (!client.isConnected && !this.stopped && generation === this.generation)
					this.scheduleReconnect(client);
			}
		}, delay);
		client.reconnectTimer.unref?.();
	}

	watchClient(client) {
		if (this.stopped || client.watching || !client.isConnected) return;
		client.watching = true;
		const generation = this.generation;
		client.docker.getEvents(
			{ filters: { type: ["container"], event: ["start", "die", "pause", "unpause", "rename"] } },
			(err, stream) => {
				if (this.stopped || generation !== this.generation) {
					stream?.destroy();
					return;
				}
				if (err) {
					client.watching = false;
					this.connectionFailed(client, err, "Event connection failed");
					this.scheduleReconnect(client);
					return;
				}
				client.stream = stream;
				if (client.optionalSocketMissing) client.reconnectAttempts = 0;
				if (client.lastConnectionFailure)
					logger.info(`Docker Auto-Discovery [${client.name}]: Connection restored.`);
				client.optionalSocketMissing = false;
				client.optionalSocketAttempts = 0;
				client.lastConnectionFailure = null;
				this.initialized = true;
				const connectedAt = Date.now();
				let buffer = "";
				let pendingEvent = Promise.resolve();
				const current = () => !this.stopped && generation === this.generation && client.stream === stream;
				const ended = () => {
					if (!current()) return;
					// Briefly accepted streams can still flap; reset backoff after a stable connection.
					if (Date.now() - connectedAt >= 30000) client.reconnectAttempts = 0;
					client.stream = null;
					client.watching = false;
					stream.destroy();
					this.scheduleReconnect(client);
				};
				const handleEvent = async (line) => {
					if (!current()) return;
					try {
						const event = JSON.parse(line);
						const containerId = event.Actor.ID;
						if (["start", "unpause", "rename"].includes(event.Action)) {
							const container = await client.docker.getContainer(containerId).inspect();
							if (current()) await this.processContainer(container, client);
						} else if (["die", "pause"].includes(event.Action)) {
							await this.disableContainerHost(containerId);
						}
					} catch (error) {
						logger.warn(`Docker Auto-Discovery [${client.name}]: Event failed: ${error.message}`);
					}
				};
				stream.setEncoding("utf8");
				stream.on("data", (chunk) => {
					buffer += chunk;
					while (buffer.includes("\n")) {
						const newline = buffer.indexOf("\n");
						const line = buffer.slice(0, newline);
						buffer = buffer.slice(newline + 1);
						if (line.trim()) pendingEvent = pendingEvent.then(() => handleEvent(line));
					}
					// Docker events are small JSON records; a broken stream must not grow memory indefinitely.
					if (buffer.length > 1024 * 1024) ended();
				});
				stream.on("error", ended);
				stream.on("end", ended);
				stream.on("close", ended);
			},
		);
	}

	async watch() {
		for (const client of this.clients) this.watchClient(client);
	}

	stop() {
		this.stopped = true;
		this.initialized = false;
		this.generation++;
		clearTimeout(this.reloadTimer);
		this.reloadTimer = null;
		this.pendingHostIds.clear();
		for (const client of this.clients) {
			clearTimeout(client.reconnectTimer);
			client.reconnectTimer = null;
			client.watching = false;
			client.isConnected = false;
			client.stream?.destroy();
			client.stream = null;
		}
	}

	// Helper for debounce
	reloadTimer = null;

	/**
	 * Trigger Nginx reload with debounce
	 */
	triggerReload() {
		if (this.reloadTimer) clearTimeout(this.reloadTimer);
		this.reloadTimer = setTimeout(async () => {
			this.reloadTimer = null;
			const hostIds = [...this.pendingHostIds];
			this.pendingHostIds.clear();
			try {
				if (hostIds.length > 0) {
					logger.info(`Docker Auto-Discovery: Validating ${hostIds.length} queued host update(s)...`);
					const hosts = await ProxyHost.query()
						.whereIn("id", hostIds)
						.where("is_deleted", 0)
						.withGraphFetched("[owner,access_list.[items,clients],certificate,host_domains]");
					await internalNginx.bulkGenerateConfigs(ProxyHost, "proxy_host", hosts);
				}
				logger.info("Docker Auto-Discovery: Triggering batched Nginx reload...");
				await internalNginx.reload();
			} catch (err) {
				logger.error("Docker Auto-Discovery: Batch configuration or reload failed", err);
			}
		}, 2000);
	}

	/**
	 * Queue a changed host for a debounced Nginx batch.
	 * @param {number} hostId
	 */
	async configureNginx(hostId) {
		this.pendingHostIds.add(hostId);
		this.triggerReload();
	}

	/**
	 * Process a single container: check labels, upsert ProxyHost
	 * @param {Object} container - Container Info (from list or inspect)
	 * @param {Object} client - The client object {docker, hostIp, isRemote, ...}
	 */
	async processContainer(container, client, hostIndex = undefined) {
		// Normalize labels
		const labels = container.Labels || (container.Config ? container.Config.Labels : {}) || {};

		// Check for required label
		if (!labels["shieldpm.hostname"]) {
			return;
		}

		const domains = labels["shieldpm.hostname"].split(",").map((d) => d.trim());
		const scheme = labels["shieldpm.scheme"] || "http";
		const portLabel = labels["shieldpm.port"]; // Internal port

		// Auth
		const _authUser = labels["shieldpm.auth_user"];
		const _authPass = labels["shieldpm.auth_pass"];
		const accessListId = labels["shieldpm.access_list_id"];

		// Advanced Options (Booleans)
		const boolLabels = {
			"shieldpm.ssl_forced": "ssl_forced",
			"shieldpm.caching_enabled": "caching_enabled",
			"shieldpm.block_exploits": "block_exploits",
			"shieldpm.allow_websocket_upgrade": "allow_websocket_upgrade",
			"shieldpm.http2_support": "http2_support",
			"shieldpm.hsts_enabled": "hsts_enabled",
			"shieldpm.hsts_subdomains": "hsts_subdomains",
			"shieldpm.disable_buffering": "disable_buffering",
			"shieldpm.maintenance_active": "maintenance_active",
			"shieldpm.maintenance_on_failure": "maintenance_on_failure",
		};

		// Advanced Config (String)
		const advancedConfig = labels["shieldpm.advanced_config"];

		// Other Advanced Options
		const bandwidthLimit = labels["shieldpm.bandwidth_limit"];
		const forwardQuery = labels["shieldpm.forward_query"];

		// Rate Limiting
		const limitRate = labels["shieldpm.limit_rate"];
		const limitUnit = labels["shieldpm.limit_unit"];
		const limitBurst = labels["shieldpm.limit_burst"];

		// Network / IP Logic
		let forwardHost = "127.0.0.1";
		let forwardPort = 80;
		let internalPort = 80;

		if (portLabel) {
			internalPort = Number.parseInt(portLabel, 10);
		}

		if (client.isRemote) {
			forwardHost = client.hostIp;
			const ports = container.NetworkSettings?.Ports || {};
			const portKey = `${internalPort}/tcp`;
			const bindings = ports[portKey];

			if (bindings && bindings.length > 0) {
				forwardPort = Number.parseInt(bindings[0].HostPort, 10);
			} else if (
				Array.isArray(container.Ports) &&
				container.Ports.some(
					(port) => port.PrivatePort === internalPort && port.Type === "tcp" && port.PublicPort,
				)
			) {
				forwardPort = container.Ports.find(
					(port) => port.PrivatePort === internalPort && port.Type === "tcp" && port.PublicPort,
				).PublicPort;
			} else {
				logger.warn(
					`Docker Auto-Discovery [${client.name}]: Container ${container.Name} does not map internal port ${internalPort}/tcp to host. Routing might fail.`,
				);
				forwardPort = internalPort;
			}
		} else {
			const networks = container.NetworkSettings?.Networks || {};
			const firstNetName = Object.keys(networks)[0];
			if (firstNetName && networks[firstNetName].IPAddress) {
				forwardHost = networks[firstNetName].IPAddress;
			} else {
				const name = container.Name ? container.Name.replace(/^\//, "") : null;
				if (name) forwardHost = name;
			}
			forwardPort = internalPort;
		}

		logger.info(
			`Docker Auto-Discovery: Processing ${domains.join(", ")} -> ${scheme}://${forwardHost}:${forwardPort}`,
		);

		try {
			internalHost.validateDomainNames(domains);
			if (!["http", "https", "grpc", "grpcs"].includes(scheme))
				throw new errs.ConfigurationError("Invalid Docker forwarding scheme");
			if (
				!Number.isInteger(forwardPort) ||
				forwardPort < 1 ||
				forwardPort > 65535 ||
				(portLabel && !/^\d+$/.test(portLabel))
			) {
				throw new errs.ConfigurationError("Invalid Docker forwarding port");
			}
			if (bandwidthLimit && !/^\d+(?:\.\d+)?[km]?$/i.test(bandwidthLimit))
				throw new errs.ConfigurationError("Invalid Docker bandwidth limit");
			if (forwardQuery && /["\\\r\n\0]/.test(forwardQuery))
				throw new errs.ConfigurationError("Invalid Docker forward query");
			if (limitUnit && !["s", "m", "second", "minute"].includes(limitUnit))
				throw new errs.ConfigurationError("Invalid Docker rate limit unit");
			for (const [value, maximum] of [
				[limitRate, 100000],
				[limitBurst, 100000],
				[accessListId, Number.MAX_SAFE_INTEGER],
			]) {
				if (value && (!/^\d+$/.test(value) || Number(value) > maximum))
					throw new errs.ConfigurationError("Invalid Docker numeric label");
			}
			const index = hostIndex || (await this.createHostIndex());
			const existingHost =
				index.byContainer.get(container.Id) ||
				domains.map((domain) => index.byDomain.get(domain)).find(Boolean);
			const collisionHost = domains.map((domain) => index.manualDomains.get(domain)).find(Boolean);
			if (collisionHost) {
				logger.error(
					`Docker Auto-Discovery: Domains [${domains.join(", ")}] collide with manual host #${collisionHost.id}. Skipping.`,
				);
				return;
			}

			// SSL
			let certificateId = 0;
			const sslProvider = labels["shieldpm.ssl_provider"];
			const sslEmail = labels["shieldpm.ssl_email"] || "admin@example.com";
			const manualCertId = labels["shieldpm.certificate_id"];

			if (manualCertId) {
				certificateId = Number.parseInt(manualCertId, 10);
			} else if (existingHost?.certificate_id) {
				certificateId = existingHost.certificate_id;
			}

			if (sslProvider === "letsencrypt" && !manualCertId) {
				try {
					if (!existingHost?.certificate_id || labels["shieldpm.force_new_cert"]) {
						logger.info(
							`Docker Auto-Discovery: Requesting Let's Encrypt Certificate for ${domains.join(", ")}...`,
						);
						const newCert = await internalCertificate.create(mockAccess, {
							provider: "letsencrypt",
							domain_names: domains,
							meta: {
								letsencrypt_agree_tos: true,
								dns_challenge: false,
								email: sslEmail,
							},
						});
						certificateId = newCert.id;
						logger.info(`Docker Auto-Discovery: Certificate #${certificateId} created successfully.`);
					}
				} catch (certErr) {
					logger.error("Docker Auto-Discovery: Failed to obtain Let's Encrypt Certificate", certErr);
				}
			}

			const payload = {
				host_domains: domains.map((domain_name) => ({ domain_name })),
				forward_scheme: scheme,
				forward_host: forwardHost,
				forward_port: forwardPort,
				access_list_id: 0,
				certificate_id: certificateId,
				meta: {
					auto_discovered: true,
					docker_container_id: container.Id,
					description: `Auto-discovered container: ${container.Name?.replace(/^\//, "") || container.Id.substring(0, 12)}`,
				},
				enabled: 1,
			};

			// Apply Booleans
			for (const [label, field] of Object.entries(boolLabels)) {
				if (labels[label] === "true" || labels[label] === "1") {
					payload[field] = 1;
				} else if (labels[label] === "false" || labels[label] === "0") {
					payload[field] = 0;
				}
			}

			// Defaults for booleans if not set
			if (typeof payload.ssl_forced === "undefined") payload.ssl_forced = 0;
			if (typeof payload.caching_enabled === "undefined") payload.caching_enabled = 0;
			if (typeof payload.block_exploits === "undefined") payload.block_exploits = 0;
			if (typeof payload.allow_websocket_upgrade === "undefined") payload.allow_websocket_upgrade = 1;

			// Handle Access List
			if (accessListId) {
				payload.access_list_id = Number.parseInt(accessListId, 10);
			}

			// Handle Rate Limiting
			if (limitRate) {
				payload.adv_limit_req_rate = Number.parseInt(limitRate, 10);
				payload.adv_limit_req_unit = ["m", "minute"].includes(limitUnit) ? "m" : "s";
				if (limitBurst) payload.adv_limit_req_burst = Number.parseInt(limitBurst, 10);
			}

			// Handle Strings (Always overwrite/reset to label value)
			// SECURITY: Sanitize advanced_config to prevent RCE
			let cleanAdvancedConfig = advancedConfig || "";
			if (cleanAdvancedConfig) {
				// SECURITY: Whitelist approach — only allow known-safe directives
				// Block anything not explicitly allowed (blocklist is always incomplete)
				const allowedDirectives =
					/^(server_name|listen|ssl_certificate|ssl_certificate_key|ssl_protocols|ssl_ciphers|proxy_pass|return|rewrite|try_files|gzip|expires|add_header|proxy_set_header|proxy_hide_header|allow|deny|proxy_read_timeout|proxy_connect_timeout|proxy_send_timeout|client_max_body_size|keepalive_timeout|send_timeout)\s+[^;{}]+;\s*$/i;
				const lines = cleanAdvancedConfig.split("\n");
				const safeLines = lines.filter((line) => {
					const trimmed = line.trim();
					if (!trimmed || trimmed.startsWith("#")) return true; // Allow comments
					return allowedDirectives.test(trimmed);
				});
				cleanAdvancedConfig = safeLines.join("\n");
				if (cleanAdvancedConfig !== advancedConfig) {
					logger.warn(`Docker Auto-Discovery: Removed unsafe directives from advanced config for ${domains}`);
				}
			}
			payload.advanced_config = cleanAdvancedConfig;
			payload.bandwidth_limit = bandwidthLimit || null;
			payload.forward_query = forwardQuery || null;

			if (existingHost) {
				// Update
				let upstreamChanged = false;
				const updatedHost = await withHostDomainClaims(
					{ hostType: "proxy", hostId: existingHost.id, domainNames: domains },
					async (trx) => {
						// Certificate requests can outlive user edits. Merge only after locking the current row.
						const current = await ProxyHost.query(trx)
							.findById(existingHost.id)
							.where("is_deleted", 0)
							.forUpdate();
						if (!current) throw new errs.ItemNotFoundError(existingHost.id);
						upstreamChanged =
							current.forward_scheme !== payload.forward_scheme ||
							current.forward_host !== payload.forward_host ||
							Number(current.forward_port) !== payload.forward_port;
						return ProxyHost.query(trx).upsertGraphAndFetch({
							id: current.id,
							...payload,
							meta: { ...current.meta, ...payload.meta },
						});
					},
				);
				if (!updatedHost) return;
				this.indexHost(index, updatedHost);
				await notifyProxyHostDomainsChanged();
				if (upstreamChanged) {
					// A previous health result belongs to the old target. Disable HTTP
					// monitoring if the new scheme cannot be probed by that monitor.
					await internalProxyHostMonitor.resetHost(updatedHost.id, { disableUnsupported: true });
				}
				// RELOAD NGINX via Helper
				await this.configureNginx(updatedHost.id);
				logger.info(`Docker Auto-Discovery: Updated host #${existingHost.id}`);
			} else {
				// Create
				payload.owner_user_id = SYSTEM_USER_ID;
				payload.locations = [];

				const newHost = await withHostDomainClaims({ hostType: "proxy", domainNames: domains }, (trx) =>
					ProxyHost.query(trx).insertGraphAndFetch(payload),
				);
				this.indexHost(index, newHost);
				await notifyProxyHostDomainsChanged();
				// RELOAD NGINX via Helper
				await this.configureNginx(newHost.id);
				logger.info(`Docker Auto-Discovery: Created host #${newHost.id}`);
			}
		} catch (dbErr) {
			logger.error(`Docker Auto-Discovery: Database error for ${domains}`, dbErr);
		}
	}

	/**
	 * Disable the host associated with a stopping container
	 * @param {string} containerId
	 */
	async disableContainerHost(containerId) {
		try {
			// Find host
			const hosts = await ProxyHost.query().where("is_deleted", 0);
			let existingHost = null;
			for (const h of hosts) {
				if (h.meta?.auto_discovered && h.meta.docker_container_id === containerId) {
					existingHost = h;
					break;
				}
			}

			if (existingHost) {
				const disabledHost = await ProxyHost.query().patchAndFetchById(existingHost.id, { enabled: 0 });
				await this.configureNginx(disabledHost.id);
				logger.info(`Docker Auto-Discovery: Disabled host #${existingHost.id} (Container stopped)`);
			}
		} catch (err) {
			logger.error(`Docker Auto-Discovery: Error disabling host for ${containerId}`, err);
		}
	}
}

const instance = new DockerService();
export default instance;
