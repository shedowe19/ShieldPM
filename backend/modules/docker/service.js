import { SYSTEM_USER_ID } from "../../lib/constants.js";
import { global as logger } from "../../logger.js";
import ProxyHost from "../../models/proxy_host.js";
import { certificateService } from "../../modules/certificate/index.js";
import { nginxService } from "../../modules/nginx/index.js";
import { clearClients, createDockerClient, getClients, pushClient, reloadState } from "./state.js";

const mockAccess = {
	token: {
		getUserId: () => SYSTEM_USER_ID,
		getScope: () => [],
		get: () => null,
		hasScope: () => true,
	},
	can: () => Promise.resolve({ permission_visibility: "all" }),
};

class DockerService {
	async init() {
		try {
			clearClients();
			this.addClient("/var/run/docker.sock");
			const envHosts = process.env.DOCKER_HOSTS;
			if (envHosts) {
				const hosts = envHosts
					.split(",")
					.map((h) => h.trim())
					.filter((h) => h);
				for (const host of hosts) {
					if (host.includes("/var/run/docker.sock")) continue;
					this.addClient(host);
				}
			}
			if (getClients().length === 0) {
				logger.warn("Docker Auto-Discovery: No docker hosts configured.");
				return;
			}
			for (const clientObj of getClients()) {
				try {
					await clientObj.docker.ping();
					clientObj.isConnected = true;
					logger.info(`Docker Auto-Discovery: Connected to ${clientObj.name}`);
				} catch (err) {
					logger.warn(`Docker Auto-Discovery: Could not connect to ${clientObj.name}: ${err.message}`);
					clientObj.isConnected = false;
				}
			}
			await this.sync();
			this.watch();
		} catch (err) {
			logger.warn("Docker Auto-Discovery: Initialization failed.", err.message);
		}
	}

	addClient(hostString) {
		try {
			pushClient(createDockerClient(hostString));
		} catch (e) {
			logger.error(`Docker Auto-Discovery: Invalid host URL ${hostString}`, e);
		}
	}

	async sync() {
		for (const client of getClients()) {
			if (!client.isConnected) continue;
			try {
				const containers = await client.docker.listContainers();
				logger.info(
					`Docker Auto-Discovery [${client.name}]: Found ${containers.length} running containers. Syncing...`,
				);
				const syncPromises = containers.map((containerInfo) => this.processContainer(containerInfo, client));
				await Promise.allSettled(syncPromises);
			} catch (err) {
				logger.error(`Docker Auto-Discovery [${client.name}]: Sync failed`, err);
			}
		}
	}

	async watch() {
		for (const client of getClients()) {
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
								} catch {}
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

	triggerReload() {
		if (reloadState.timer) clearTimeout(reloadState.timer);
		reloadState.timer = setTimeout(async () => {
			try {
				logger.info("Docker Auto-Discovery: Triggering batched Nginx reload...");
				await nginxService.reload();
			} catch (err) {
				logger.error("Docker Auto-Discovery: Reload failed", err);
			}
		}, 2000);
	}

	async configureNginx(hostId) {
		try {
			const host = await ProxyHost.query()
				.findById(hostId)
				.withGraphFetched("[owner,access_list,certificate]")
				.where("is_deleted", 0);
			if (host?.enabled) await nginxService.generateConfig("proxy_host", host);
			else if (host) await nginxService.deleteConfig("proxy_host", host);
			this.triggerReload();
		} catch (err) {
			logger.error(`Docker Auto-Discovery: Error configuring Nginx for host #${hostId}`, err);
		}
	}

	async processContainer(container, client) {
		const labels = container.Labels || (container.Config ? container.Config.Labels : {}) || {};
		if (!labels["shieldpm.hostname"]) return;
		const domains = labels["shieldpm.hostname"].split(",").map((d) => d.trim());
		const scheme = labels["shieldpm.scheme"] || "http";
		const portLabel = labels["shieldpm.port"];
		const accessListId = labels["shieldpm.access_list_id"];
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
		const advancedConfig = labels["shieldpm.advanced_config"];
		const bandwidthLimit = labels["shieldpm.bandwidth_limit"];
		const forwardQuery = labels["shieldpm.forward_query"];
		const limitRate = labels["shieldpm.limit_rate"];
		const limitUnit = labels["shieldpm.limit_unit"];
		const limitBurst = labels["shieldpm.limit_burst"];
		let forwardHost = "127.0.0.1";
		let forwardPort = 80;
		let internalPort = 80;
		if (portLabel) internalPort = Number.parseInt(portLabel, 10);
		if (client.isRemote) {
			forwardHost = client.hostIp;
			const ports = container.NetworkSettings?.Ports || {};
			const portKey = `${internalPort}/tcp`;
			const bindings = ports[portKey];
			if (bindings && bindings.length > 0) forwardPort = Number.parseInt(bindings[0].HostPort, 10);
			else {
				logger.warn(
					`Docker Auto-Discovery [${client.name}]: Container ${container.Name} does not map internal port ${internalPort}/tcp to host. Routing might fail.`,
				);
				forwardPort = internalPort;
			}
		} else {
			const networks = container.NetworkSettings ? container.NetworkSettings.Networks : {};
			const firstNetName = Object.keys(networks)[0];
			if (firstNetName && networks[firstNetName].IPAddress) forwardHost = networks[firstNetName].IPAddress;
			else {
				const name = container.Name ? container.Name.replace(/^\//, "") : null;
				if (name) forwardHost = name;
			}
			forwardPort = internalPort;
		}
		logger.info(
			`Docker Auto-Discovery: Processing ${domains.join(", ")} -> ${scheme}://${forwardHost}:${forwardPort}`,
		);
		try {
			const allHosts = await ProxyHost.query().where("is_deleted", 0);
			let existingHost = null;
			let collisionHost = null;
			for (const h of allHosts) {
				if (h.meta?.auto_discovered && h.meta.docker_container_id === container.Id) {
					existingHost = h;
					break;
				}
				if (!existingHost) {
					const intersect = h.domain_names.filter((d) => domains.includes(d));
					if (intersect.length > 0) {
						if (h.meta?.auto_discovered) existingHost = h;
						else collisionHost = h;
					}
				}
			}
			if (collisionHost && !existingHost) {
				logger.error(
					`Docker Auto-Discovery: Collision detected! Domains [${domains.join(", ")}] are already used by Manual Host #${collisionHost.id}. Skipping.`,
				);
				return;
			}
			let certificateId = 0;
			const sslProvider = labels["shieldpm.ssl_provider"];
			const sslEmail = labels["shieldpm.ssl_email"] || "admin@example.com";
			const manualCertId = labels["shieldpm.certificate_id"];
			if (manualCertId) certificateId = Number.parseInt(manualCertId, 10);
			else if (existingHost?.certificate_id) certificateId = existingHost.certificate_id;
			if (sslProvider === "letsencrypt" && !manualCertId) {
				try {
					if (!existingHost || !existingHost.certificate_id || labels["shieldpm.force_new_cert"]) {
						logger.info(
							`Docker Auto-Discovery: Requesting Let's Encrypt Certificate for ${domains.join(", ")}...`,
						);
						const newCert = await certificateService.create(mockAccess, {
							provider: "letsencrypt",
							domain_names: domains,
							meta: { letsencrypt_agree_tos: true, dns_challenge: false, email: sslEmail },
						});
						certificateId = newCert.id;
						logger.info(`Docker Auto-Discovery: Certificate #${certificateId} created successfully.`);
					}
				} catch (certErr) {
					logger.error("Docker Auto-Discovery: Failed to obtain Let's Encrypt Certificate", certErr);
				}
			}
			const payload = {
				domain_names: domains,
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
			for (const [label, field] of Object.entries(boolLabels)) {
				if (labels[label] === "true" || labels[label] === "1") payload[field] = 1;
				else if (labels[label] === "false" || labels[label] === "0") payload[field] = 0;
			}
			if (typeof payload.ssl_forced === "undefined") payload.ssl_forced = 0;
			if (typeof payload.caching_enabled === "undefined") payload.caching_enabled = 0;
			if (typeof payload.block_exploits === "undefined") payload.block_exploits = 0;
			if (typeof payload.allow_websocket_upgrade === "undefined") payload.allow_websocket_upgrade = 1;
			if (accessListId) payload.access_list_id = Number.parseInt(accessListId, 10);
			if (limitRate) {
				payload.adv_limit_req_rate = Number.parseInt(limitRate, 10);
				payload.adv_limit_req_unit = limitUnit || "second";
				if (limitBurst) payload.adv_limit_req_burst = Number.parseInt(limitBurst, 10);
			}
			let cleanAdvancedConfig = advancedConfig || "";
			if (cleanAdvancedConfig) {
				const dangerous =
					/lua_|perl_|exec|include|root|alias|types|so_|load_module|access_log|error_log|client_body_temp_path|fastcgi_temp_path|uwsgi_temp_path|scgi_temp_path/i;
				if (dangerous.test(cleanAdvancedConfig)) {
					logger.warn(
						`Docker Auto-Discovery: Blocking dangerous advanced config for ${domains}: ${cleanAdvancedConfig}`,
					);
					cleanAdvancedConfig = "# Dangerous config blocked by ShieldPM Security";
				}
			}
			payload.advanced_config = cleanAdvancedConfig;
			payload.bandwidth_limit = bandwidthLimit || null;
			payload.forward_query = forwardQuery || null;
			if (existingHost) {
				const updatedHost = await ProxyHost.query().patchAndFetchById(existingHost.id, payload);
				await this.configureNginx(updatedHost.id);
				logger.info(`Docker Auto-Discovery: Updated host #${existingHost.id}`);
			} else {
				payload.owner_user_id = SYSTEM_USER_ID;
				payload.locations = [];
				const newHost = await ProxyHost.query().insertAndFetch(payload);
				await this.configureNginx(newHost.id);
				logger.info(`Docker Auto-Discovery: Created host #${newHost.id}`);
			}
		} catch (dbErr) {
			logger.error(`Docker Auto-Discovery: Database error for ${domains}`, dbErr);
		}
	}

	async disableContainerHost(containerId) {
		try {
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
