import Docker from "dockerode";
import { global as logger } from "../logger.js";
import ProxyHost from "../models/proxy_host.js";
import AccessList from "../models/access_list.js";
import { Model } from "objection";

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
            const hosts = await ProxyHost.query().where("is_deleted", 0);

            let existingHost = null;
            for (const h of hosts) {
                if (h.meta && h.meta.auto_discovered && h.meta.docker_container_id === container.Id) {
                    existingHost = h;
                    break;
                }
            }

            const payload = {
                domain_names: domains,
                forward_scheme: scheme,
                forward_host: forwardHost,
                forward_port: forwardPort,
                access_list_id: 0, // Default
                certificate_id: 0, // Default
                meta: {
                    auto_discovered: true,
                    docker_container_id: container.Id,
                    description: `Auto-discovered container: ${container.Name?.replace(/^\//, "") || container.Id.substring(0, 12)}`,
                },
                enabled: 1, // Enable on update/start
            };

            // Handle Access List
            if (accessListId) {
                payload.access_list_id = Number.parseInt(accessListId, 10);
            }

            if (existingHost) {
                // Update
                await ProxyHost.query().patchAndFetchById(existingHost.id, payload);
                logger.info(`Docker Auto-Discovery: Updated host #${existingHost.id}`);
            } else {
                // Create
                payload.owner_user_id = 1;
                // Defaults
                payload.ssl_forced = 0;
                payload.caching_enabled = 0;
                payload.block_exploits = 0;
                payload.allow_websocket_upgrade = 1;

                // Defaults for fields possibly missing in older schemas or required by MySQL
                payload.advanced_config = '';
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
