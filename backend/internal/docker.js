import Docker from "dockerode";
import { global as logger } from "../logger.js";
import ProxyHost from "../models/proxy_host.js";
import AccessList from "../models/access_list.js";
import Certificate from "../models/certificate.js";
import internalCertificate from "./certificate.js";
import { Model } from "objection";

const mockAccess = {
	token: {
		getUserId: () => 1,
	},
	can: () => Promise.resolve({ permission_visibility: "all" }),
};

class DockerService {
	constructor() {
		this.docker = null;
		this.isConnected = false;
	}

	async init() {
		try {
			// Check if docker socket exists or env var is set
			// Default to /var/run/docker.sock
			this.docker = new Docker({ socketPath: "/var/run/docker.sock" });

			// Ping to verify connection
			await this.docker.ping();
			this.isConnected = true;
			logger.info("Docker Auto-Discovery: Connected to Docker Daemon");

			// Initial Sync
			await this.sync();

			// Start Watching
			this.watch();
		} catch (err) {
			logger.warn("Docker Auto-Discovery: Could not connect to Docker Daemon. Feature disabled.", err.message);
		}
	}

	/**
	 * Syncs all currently running containers
	 */
	async sync() {
		if (!this.isConnected) return;

		try {
			const containers = await this.docker.listContainers();
			logger.info(`Docker Auto-Discovery: Found ${containers.length} running containers. Syncing...`);

			for (const containerInfo of containers) {
				// We need full details for labels sometimes, but listContainers usually keeps labels
				// Let's inspect to be sure or just use what we have if labels are present
				await this.processContainer(containerInfo);
			}
		} catch (err) {
			logger.error("Docker Auto-Discovery: Sync failed", err);
		}
	}

	/**
	 * Listen to Docker Events
	 */
	async watch() {
		if (!this.isConnected) return;

		this.docker.getEvents(
			{ filters: { type: ["container"], event: ["start", "die", "pause", "unpause", "rename"] } },
			(err, stream) => {
				if (err) {
					logger.error("Docker Auto-Discovery: Error getting events", err);
					return;
				}

				logger.info("Docker Auto-Discovery: Listening for Docker events...");

				stream.on("data", async (chunk) => {
					try {
						const event = JSON.parse(chunk.toString());
						// logger.debug('Docker Event:', event.Action, event.Actor.Attributes.name);

						const containerId = event.Actor.ID;
						// We need to inspect because event might not have all labels or network info
						// For 'die', we can't inspect easily if it's gone, but we might have data in DB.
						// Actually 'die' means stopped, so we should disable.

						if (["start", "unpause", "rename"].includes(event.Action)) {
							try {
								const container = await this.docker.getContainer(containerId).inspect();
								await this.processContainer(container);
							} catch (inspectErr) {
								// Container might have stopped immediately
							}
						} else if (["die", "pause"].includes(event.Action)) {
							await this.disableContainerHost(containerId);
						}
					} catch (e) {
						logger.error("Docker Auto-Discovery: Error parsing event", e);
					}
				});
			},
		);
	}

	/**
	 * Process a single container: check labels, upsert ProxyHost
	 * @param {Object} container - Container Info (from list or inspect)
	 */
	async processContainer(container) {
		// Normalize labels
		const labels = container.Labels || (container.Config ? container.Config.Labels : {}) || {};

		// Check for required label
		if (!labels["shieldpm.hostname"]) {
			return;
		}

		const domains = labels["shieldpm.hostname"].split(",").map((d) => d.trim());
		const scheme = labels["shieldpm.scheme"] || "http";
		const port = labels["shieldpm.port"];

		// Auth
		const authUser = labels["shieldpm.auth_user"];
		const authPass = labels["shieldpm.auth_pass"]; // Plaintext password (careful!)
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

		// Advanced Config (Custom Nginx)
		// Note: Using newlines in docker labels can be tricky (often requires base64 encoding or specific formatting).
		// ShieldPM will treat the value as a string.
		const advancedConfig = labels["shieldpm.advanced_config"];

		// Rate Limiting
		const limitRate = labels["shieldpm.limit_rate"]; // e.g. 10
		const limitUnit = labels["shieldpm.limit_unit"]; // e.g. second, minute
		const limitBurst = labels["shieldpm.limit_burst"]; // e.g. 20

		// Network / IP
		let forwardHost = "127.0.0.1"; // Fallback
		let forwardPort = 80;

		// Try to find the IP address
		// If using bridge network, usually it's in NetworkSettings.Networks...
		const networks = container.NetworkSettings ? container.NetworkSettings.Networks : {};
		// Prefer the first network that isn't none or host?
		// Or assume ShieldPM is on the same network.

		// If we are in "host" network mode (container), then 127.0.0.1 refers to host.
		// If we are in "bridge", we need the gateway or the container IP.

		// Simple approach: grab the first IP found.
		const firstNetName = Object.keys(networks)[0];
		if (firstNetName && networks[firstNetName].IPAddress) {
			forwardHost = networks[firstNetName].IPAddress;
		} else {
			// Fallback: use container name if on a custom user-defined network where DNS works
			// Strip leading /
			const name = container.Name ? container.Name.replace(/^\//, "") : null;
			if (name) forwardHost = name;
		}

		if (port) {
			forwardPort = Number.parseInt(port, 10);
		} else {
			// Try to auto-detect exposed port
			// Config.ExposedPorts or NetworkSettings.Ports
			// This is complex, defaulting to 80 is safer if not specified.
			forwardPort = 80;
		}

		logger.info(
			`Docker Auto-Discovery: Processing ${domains.join(", ")} -> ${scheme}://${forwardHost}:${forwardPort}`,
		);

		// Database Transaction
		try {
			// strategy: unique identifier is the container ID.

			// Fetch all hosts that are auto-discovered?
			// Strategy:
			// 1. Find by Container ID (Exact match)
			// 2. Find by Domain Name (Adoption candidate or Collision)

			const allHosts = await ProxyHost.query().where("is_deleted", 0);
			let existingHost = null;
			let collisionHost = null;

			for (const h of allHosts) {
				// Check for exact container match
				if (h.meta && h.meta.auto_discovered && h.meta.docker_container_id === container.Id) {
					existingHost = h;
					break; // Found exact match, stop looking
				}

				// Check for domain collision (if we haven't found exact match yet)
				// We check if ANY of the new domains exist in this host's domains
				if (!existingHost) {
					const intersect = h.domain_names.filter((d) => domains.includes(d));
					if (intersect.length > 0) {
						// Found a potential match/collision
						if (h.meta && h.meta.auto_discovered) {
							// It's an orphan auto-discovered host -> ADOPT IT
							existingHost = h;
						} else {
							// It's a manual host -> COLLISION
							collisionHost = h;
						}
					}
				}
			}

			if (collisionHost && !existingHost) {
				logger.error(
					`Docker Auto-Discovery: Collision detected! Domains [${domains.join(", ")}] are already used by Manual Host #${collisionHost.id} (${collisionHost.domain_names.join(", ")}). Skipping auto-creation.`,
				);
				return;
			}

			// SSL / Certificate Logic
			let certificateId = 0;
			const sslProvider = labels["shieldpm.ssl_provider"]; // 'letsencrypt'
			const sslEmail = labels["shieldpm.ssl_email"] || "admin@example.com";
			const manualCertId = labels["shieldpm.certificate_id"];

			if (manualCertId) {
				// User explicitly requested a specific certificate (e.g. Wildcard/DNS)
				certificateId = Number.parseInt(manualCertId, 10);
			} else if (existingHost && existingHost.certificate_id) {
				// Keep existing cert if possible?
				// Only if we stick to the same domains.
				// For now, default to keeping it unless label says otherwise or domains changed significantly
				certificateId = existingHost.certificate_id;
			}

			// Only request new cert if NO manual cert ID was provided
			if (sslProvider === "letsencrypt" && !manualCertId) {
				try {
					// Check if we already have a cert for these domains
					// Simple check: exactly match domain list?
					// Or just check if there is a cert that covers them?
					// For Simplicity: Check for a cert named after the first domain
					// Better: Try to find a cert that contains ALL domains.
					// ...Too complex for auto-discovery speed.

					// Try to find a cert created by us for this container?
					// Use existing host logic. If we have existingHost, we have certificateId.
					// If not, or if we want to force renew?

					if (!existingHost || !existingHost.certificate_id || labels["shieldpm.force_new_cert"]) {
						logger.info(
							`Docker Auto-Discovery: Requesting Let's Encrypt Certificate for ${domains.join(", ")}...`,
						);

						// Sanity check: ensure we aren't spamming LE
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
					// Fallback to HTTP?
					// We continue with certificate_id = 0
				}
			}

			const payload = {
				domain_names: domains,
				forward_scheme: scheme,
				forward_host: forwardHost,
				forward_port: forwardPort,
				access_list_id: 0, // Default
				certificate_id: certificateId,
				meta: {
					auto_discovered: true,
					docker_container_id: container.Id,
					description: `Auto-discovered container: ${container.Name?.replace(/^\//, "") || container.Id.substring(0, 12)}`,
				},
				enabled: 1, // Enable on update/start
			};

			// Apply Booleans
			for (const [label, field] of Object.entries(boolLabels)) {
				if (labels[label] === "true" || labels[label] === "1") {
					payload[field] = 1;
				} else if (labels[label] === "false" || labels[label] === "0") {
					payload[field] = 0;
				}
				// If not set, leave default or inherit
			}

			// Apply Defaults if not set by label (override Objections defaults if needed, but model handles defaults)
			// But objection defaults might be null.

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
				payload.adv_limit_req_unit = limitUnit || "second"; // Default to second?
				if (limitBurst) payload.adv_limit_req_burst = Number.parseInt(limitBurst, 10);
			}

			if (existingHost) {
				// Update
				await ProxyHost.query().patchAndFetchById(existingHost.id, payload);
				logger.info(`Docker Auto-Discovery: Updated host #${existingHost.id}`);
			} else {
				// Create
				payload.owner_user_id = 1;

				// Defaults for fields possibly missing in older schemas or required by MySQL
				payload.advanced_config = advancedConfig || "";
				payload.locations = [];

				const newHost = await ProxyHost.query().insert(payload);
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
				if (h.meta && h.meta.auto_discovered && h.meta.docker_container_id === containerId) {
					existingHost = h;
					break;
				}
			}

			if (existingHost) {
				await ProxyHost.query().patchAndFetchById(existingHost.id, { enabled: 0 });
				logger.info(`Docker Auto-Discovery: Disabled host #${existingHost.id} (Container stopped)`);
			}
		} catch (err) {
			logger.error(`Docker Auto-Discovery: Error disabling host for ${containerId}`, err);
		}
	}
}

const instance = new DockerService();
export default instance;
