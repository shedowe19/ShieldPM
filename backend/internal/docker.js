import Docker from "dockerode";
import { global as logger } from "../logger.js";
import ProxyHost from "../models/proxy_host.js";
import internalCertificate from "./certificate.js";
import internalNginx from "./nginx.js";

const mockAccess = {
    token: {
        getUserId: () => 1,
    },
    can: () => Promise.resolve({ permission_visibility: "all" }),
};

class DockerService {
    constructor() {
        this.clients = [];
    }

    async init() {
        try {
            this.clients = [];

            // 1. Local Docker Socket (Always included)
            this.addClient("/var/run/docker.sock");

            const envHosts = process.env.DOCKER_HOSTS; // e.g. "tcp://10.1.1.5:2375,tcp://10.1.1.6:2375"

            if (envHosts) {
                const hosts = envHosts
                    .split(",")
                    .map((h) => h.trim())
                    .filter((h) => h);
                for (const host of hosts) {
                    // Avoid adding local socket again if user explicitly listed it
                    if (host.includes("/var/run/docker.sock")) continue;
                    this.addClient(host);
                }
            }

            if (this.clients.length === 0) {
                logger.warn("Docker Auto-Discovery: No docker hosts configured.");
                return;
            }

            // Initialize all clients
            for (const clientObj of this.clients) {
                try {
                    await clientObj.docker.ping();
                    clientObj.isConnected = true;
                    logger.info(`Docker Auto-Discovery: Connected to ${clientObj.name}`);
                } catch (err) {
                    logger.warn(`Docker Auto-Discovery: Could not connect to ${clientObj.name}: ${err.message}`);
                    clientObj.isConnected = false;
                }
            }

            // Initial Sync
            await this.sync();

            // Start Watching
            this.watch();
        } catch (err) {
            logger.warn("Docker Auto-Discovery: Initialization failed.", err.message);
        }
    }

    /**
     * Helper to add a docker client
     * @param {string} hostString - e.g. "tcp://1.2.3.4:2375" or "/var/run/docker.sock"
     */
    addClient(hostString) {
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

                // Dockerode configuration for remote
                // If protocol is tcp, dockerode expects 'http' in protocol or just host/port object
                // simpler: pass the URI string if dockerode supports it, or parse object.
                // Dockerode 'host' option: "http://192.168.1.10" or "192.168.1.10"

                const dockerConfig = {
                    host: url.hostname,
                    port: url.port || 2375,
                    protocol: url.protocol.replace(':', '')
                };

                // Handle specific protocols
                if (url.protocol === 'tcp:') {
                    dockerConfig.protocol = 'http';
                }

                docker = new Docker(dockerConfig);
            } catch (e) {
                logger.error(`Docker Auto-Discovery: Invalid host URL ${hostString}`, e);
                return;
            }
        } else {
            // Local Socket
            docker = new Docker({ socketPath: hostString });
            name = "Local Socket";
        }

        this.clients.push({
            docker,
            hostIp,
            isRemote,
            name,
            isConnected: false
        });
    }

    /**
     * Syncs all currently running containers across all clients
     */
    async sync() {
        for (const client of this.clients) {
            if (!client.isConnected) continue;

            try {
                const containers = await client.docker.listContainers();
                logger.info(`Docker Auto-Discovery [${client.name}]: Found ${containers.length} running containers. Syncing...`);

                for (const containerInfo of containers) {
                    // We transfer the client context to processContainer
                    await this.processContainer(containerInfo, client);
                }
            } catch (err) {
                logger.error(`Docker Auto-Discovery [${client.name}]: Sync failed`, err);
            }
        }
    }

    /**
     * Listen to Docker Events
     */
    async watch() {
        for (const client of this.clients) {
            if (!client.isConnected) continue;

            client.docker.getEvents(
                { filters: { type: ["container"], event: ["start", "die", "pause", "unpause", "rename"] } },
                (err, stream) => {
                    if (err) {
                        logger.error(`Docker Auto-Discovery [${client.name}]: Error getting events`, err);
                        return;
                    }

                    logger.info(`Docker Auto-Discovery [${client.name}]: Listening for Docker events...`);

                    stream.on("data", async (chunk) => {
                        try {
                            const event = JSON.parse(chunk.toString());
                            const containerId = event.Actor.ID;

                            if (["start", "unpause", "rename"].includes(event.Action)) {
                                try {
                                    const container = await client.docker.getContainer(containerId).inspect();
                                    await this.processContainer(container, client);
                                } catch (inspectErr) {
                                    // Container might have stopped immediately
                                }
                            } else if (["die", "pause"].includes(event.Action)) {
                                await this.disableContainerHost(containerId);
                            }
                        } catch (e) {
                            logger.error(`Docker Auto-Discovery [${client.name}]: Error parsing event`, e);
                        }
                    });
                },
            );
        }
    }

    /**
     * Reload Nginx for a specific host
     * @param {number} hostId
     */
    async configureNginx(hostId) {
        try {
            const host = await ProxyHost.query()
                .findById(hostId)
                .withGraphFetched("[owner,access_list,certificate]")
                .where("is_deleted", 0);

            if (host && host.enabled) {
                // We must parse 'locations' if it's confusing internalNginx?
                // Objection handles json parsing.
                await internalNginx.configure(ProxyHost, "proxy_host", host);
            } else if (host) {
                // If disabled, delete config
                await internalNginx.deleteConfig("proxy_host", host);
                await internalNginx.reload();
            }
        } catch (err) {
            logger.error(`Docker Auto-Discovery: Error configuring Nginx for host #${hostId}`, err);
        }
    }

    /**
     * Process a single container: check labels, upsert ProxyHost
     * @param {Object} container - Container Info (from list or inspect)
     * @param {Object} client - The client object {docker, hostIp, isRemote, ...}
     */
    async processContainer(container, client) {
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

        // 1. Determine Target Internal Port
        let internalPort = 80;
        if (portLabel) {
            internalPort = Number.parseInt(portLabel, 10);
        } else {
            // Auto-detection logic if not specified? 
            // For remote, auto-detection without explicit port is RISKY.
            // Let's stick to 80 default.
        }

        if (client.isRemote) {
            // REMOTE CONTAINER LOGIC
            forwardHost = client.hostIp; // Use the Docker Host IP

            // We MUST find the mapped public port for the internalPort
            // Look in NetworkSettings.Ports
            // Ports format: { "80/tcp": [ { "HostIp": "0.0.0.0", "HostPort": "32768" } ] }

            const ports = container.NetworkSettings?.Ports || {};
            const portKey = `${internalPort}/tcp`; // Assume TCP
            const bindings = ports[portKey]; // Array of bindings

            if (bindings && bindings.length > 0) {
                // Use the first binding's HostPort
                forwardPort = Number.parseInt(bindings[0].HostPort, 10);
            } else {
                // Port is not mapped! We cannot reach it remotely via Host IP.
                // Warn and possibly abort? Or default to internal port and hope for overlay network?
                // Allowing internal port for overlay usage is advanced.
                // Let's warn but proceed with internal port if user insists? 
                // Actually, if it's not mapped, forwardHost:HostIp -> forwardPort:InternalPort won't work unless mapped 1:1.

                // Heuristic: If user supplied shieldpm.port, they might mean the internal one.
                // If not mapped, we can't do much for standard TCP remote.
                logger.warn(`Docker Auto-Discovery [${client.name}]: Container ${container.Name} does not map internal port ${internalPort}/tcp to host. Routing might fail.`);
                forwardPort = internalPort;
            }
        } else {
            // LOCAL CONTAINER LOGIC (Existing logic)

            // Try to find the IP address
            const networks = container.NetworkSettings ? container.NetworkSettings.Networks : {};
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
                const updatedHost = await ProxyHost.query().patchAndFetchById(existingHost.id, payload);
                // RELOAD NGINX via Helper
                await this.configureNginx(updatedHost.id);
                logger.info(`Docker Auto-Discovery: Updated host #${existingHost.id}`);
            } else {
                // Create
                payload.owner_user_id = 1;

                // Defaults for fields possibly missing in older schemas or required by MySQL
                payload.advanced_config = advancedConfig || "";
                payload.locations = [];

                if (bandwidthLimit) payload.bandwidth_limit = bandwidthLimit;
                if (forwardQuery) payload.forward_query = forwardQuery;

                const newHost = await ProxyHost.query().insert(payload);
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
                if (h.meta && h.meta.auto_discovered && h.meta.docker_container_id === containerId) {
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
