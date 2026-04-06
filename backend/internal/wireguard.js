import { execSync } from "node:child_process";
import fs from "node:fs";
import { global as logger } from "../logger.js";
import settingModel from "../models/setting.js";
import WireguardPeer from "../models/wireguard_peer.js";

const dataPath = process.env.DATA_PATH || "/data";
const wgDataDir = `${dataPath}/wireguard`;
const wgConfFile = `${wgDataDir}/wg0.conf`;
const serverKeyFile = `${wgDataDir}/server_private.key`;
const serverPubKeyFile = `${wgDataDir}/server_public.key`;

const WG_INTERFACE = "wg0";

// Defaults — overridden by settings from DB
const DEFAULTS = {
	endpoint: "",
	listen_port: 51820,
	subnet: "10.8.0.0/24",
	server_address: "10.8.0.1/24",
};

/**
 * Read WireGuard config from the `setting` table
 * @returns {Promise<{endpoint: string, listen_port: number, subnet: string, server_address: string}>}
 */
const getWgSettings = async () => {
	try {
		const row = await settingModel.query().where("id", "wireguard-config").first();
		if (row?.meta) {
			const meta = typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta;
			return {
				endpoint: meta.endpoint || DEFAULTS.endpoint,
				listen_port: meta.listen_port || DEFAULTS.listen_port,
				subnet: meta.subnet || DEFAULTS.subnet,
				server_address: meta.server_address || DEFAULTS.server_address,
			};
		}
	} catch (err) {
		logger.warn("WireGuard: Could not read settings, using defaults:", err.message);
	}
	return { ...DEFAULTS };
};

/**
 * Extract the subnet base from a CIDR (e.g. "10.8.0.0/24" -> "10.8.0")
 * @param {string} subnet
 * @returns {string}
 */
const getSubnetBase = (subnet) => {
	const parts = subnet.split("/")[0].split(".");
	return `${parts[0]}.${parts[1]}.${parts[2]}`;
};

/**
 * Execute a shell command and return stdout
 * @param {string} cmd
 * @returns {string}
 */
const exec = (cmd) => {
	try {
		return execSync(cmd, { encoding: "utf-8", timeout: 10000 }).trim();
	} catch (err) {
		logger.error(`WireGuard exec failed: ${cmd}`, err.message);
		throw err;
	}
};

/**
 * Check if `wg` CLI is available
 * @returns {boolean}
 */
const isWgAvailable = () => {
	try {
		exec("which wg");
		return true;
	} catch {
		return false;
	}
};

/**
 * Generate a WireGuard key pair
 * @returns {{ privateKey: string, publicKey: string }}
 */
const generateKeyPair = () => {
	const privateKey = exec("wg genkey");
	const publicKey = exec(`echo "${privateKey}" | wg pubkey`);
	return { privateKey, publicKey };
};

/**
 * Generate a preshared key
 * @returns {string}
 */
const generatePresharedKey = () => {
	return exec("wg genpsk");
};

/**
 * Get the next available IP in the WG subnet
 * @param {string} subnet
 * @returns {Promise<string>}
 */
const getNextAvailableIP = async (subnet) => {
	const peers = await WireguardPeer.query().where("is_deleted", 0);
	const usedIPs = new Set(peers.map((p) => p.client_address.split("/")[0]));
	const base = getSubnetBase(subnet);

	// Start from .2 (.1 is the server)
	for (let i = 2; i < 255; i++) {
		const ip = `${base}.${i}`;
		if (!usedIPs.has(ip)) {
			return `${ip}/32`;
		}
	}
	throw new Error("No available IPs in WireGuard subnet");
};

/**
 * Ensure the WG data directory and server keys exist
 */
const ensureServerKeys = () => {
	if (!fs.existsSync(wgDataDir)) {
		fs.mkdirSync(wgDataDir, { recursive: true });
	}

	if (!fs.existsSync(serverKeyFile)) {
		logger.info("WireGuard: Generating new server key pair...");
		const { privateKey, publicKey } = generateKeyPair();
		fs.writeFileSync(serverKeyFile, privateKey, { mode: 0o600 });
		fs.writeFileSync(serverPubKeyFile, publicKey, { mode: 0o644 });
		logger.info("WireGuard: Server key pair generated");
	}
};

/**
 * Read server private key
 * @returns {string}
 */
const getServerPrivateKey = () => {
	return fs.readFileSync(serverKeyFile, "utf-8").trim();
};

/**
 * Read server public key
 * @returns {string}
 */
const getServerPublicKey = () => {
	if (fs.existsSync(serverPubKeyFile)) {
		return fs.readFileSync(serverPubKeyFile, "utf-8").trim();
	}
	// Derive from private key
	const privateKey = getServerPrivateKey();
	const publicKey = exec(`echo "${privateKey}" | wg pubkey`);
	fs.writeFileSync(serverPubKeyFile, publicKey, { mode: 0o644 });
	return publicKey;
};

/**
 * Write the full WireGuard config file and sync
 */
const syncConfig = async () => {
	const settings = await getWgSettings();
	const serverPrivateKey = getServerPrivateKey();
	const peers = await WireguardPeer.query().where("is_deleted", 0).andWhere("status", "!=", 0);

	let config = `# ShieldPM WireGuard Configuration — Auto-generated
# Do not edit manually!

[Interface]
PrivateKey = ${serverPrivateKey}
Address = ${settings.server_address}
ListenPort = ${settings.listen_port}
SaveConfig = false
`;

	// Add PostUp/PostDown for NAT masquerading
	config += `PostUp = iptables -A FORWARD -i ${WG_INTERFACE} -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i ${WG_INTERFACE} -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
`;

	for (const peer of peers) {
		config += `
# Peer: ${peer.name} (ID: ${peer.id})
[Peer]
PublicKey = ${peer.client_public_key}
PresharedKey = ${peer.preshared_key}
AllowedIPs = ${peer.client_address}
`;
	}

	fs.writeFileSync(wgConfFile, config, { mode: 0o600 });
	logger.info("WireGuard: Config file written");
};

/**
 * Check if the WG interface is up
 * @returns {boolean}
 */
const isInterfaceUp = () => {
	try {
		exec(`ip link show ${WG_INTERFACE}`);
		return true;
	} catch {
		return false;
	}
};

/**
 * Bring the WG interface up or reload it
 */
const applyConfig = async () => {
	try {
		if (isInterfaceUp()) {
			// Sync config without restarting (graceful)
			exec(`wg syncconf ${WG_INTERFACE} <(wg-quick strip ${WG_INTERFACE})`);
			logger.info("WireGuard: Interface config synced");
		} else {
			exec(`wg-quick up ${wgConfFile}`);
			logger.info("WireGuard: Interface brought up");
		}
	} catch (err) {
		logger.error("WireGuard: Failed to apply config:", err.message);
		// Try a full restart
		try {
			exec(`wg-quick down ${wgConfFile} 2>/dev/null || true`);
			exec(`wg-quick up ${wgConfFile}`);
			logger.info("WireGuard: Interface restarted successfully");
		} catch (restartErr) {
			logger.error("WireGuard: Failed to restart interface:", restartErr.message);
		}
	}
};

/**
 * Parse `wg show` dump output for peer status
 * @returns {Map<string, {lastHandshake: number, transferRx: number, transferTx: number}>}
 */
const parsePeerStatuses = () => {
	const statuses = new Map();
	try {
		const output = exec(`wg show ${WG_INTERFACE} dump`);
		const lines = output.split("\n");

		// Skip the first line (interface info)
		for (let i = 1; i < lines.length; i++) {
			const parts = lines[i].split("\t");
			if (parts.length >= 7) {
				const publicKey = parts[0];
				const lastHandshake = parseInt(parts[4], 10);
				const transferRx = parseInt(parts[5], 10);
				const transferTx = parseInt(parts[6], 10);
				statuses.set(publicKey, { lastHandshake, transferRx, transferTx });
			}
		}
	} catch {
		// Interface might not be up
	}
	return statuses;
};

const internalWireguard = {
	/**
	 * Check if WireGuard is available
	 * @returns {boolean}
	 */
	isAvailable: () => {
		return isWgAvailable();
	},

	/**
	 * Initialize WireGuard on startup
	 */
	init: async () => {
		logger.info("Initializing WireGuard Tunnels...");

		if (!isWgAvailable()) {
			logger.warn("WireGuard (wg) CLI not found, skipping initialization");
			return;
		}

		try {
			ensureServerKeys();

			// Reset all peer statuses on boot
			const peers = await WireguardPeer.query().where("is_deleted", 0);
			if (peers.length > 0) {
				// Re-enable all non-deleted peers
				await WireguardPeer.query().patch({ status: 2 }).where("is_deleted", 0);
			}

			// Write config and bring interface up
			await syncConfig();
			await applyConfig();

			// Update statuses from live data
			await internalWireguard.refreshStatuses();

			logger.info(`WireGuard: Initialized with ${peers.length} peer(s)`);
		} catch (err) {
			logger.error("WireGuard: Initialization failed:", err.message);
		}
	},

	/**
	 * Get WireGuard settings from the setting table
	 * @returns {Promise<Object>}
	 */
	getSettings: async () => {
		return getWgSettings();
	},

	/**
	 * Update WireGuard settings in the setting table
	 * @param {Object} data - { endpoint, listen_port, subnet, server_address }
	 * @returns {Promise<Object>}
	 */
	updateSettings: async (data) => {
		const current = await getWgSettings();
		const newMeta = {
			endpoint: data.endpoint !== undefined ? data.endpoint : current.endpoint,
			listen_port: data.listen_port !== undefined ? data.listen_port : current.listen_port,
			subnet: data.subnet !== undefined ? data.subnet : current.subnet,
			server_address: data.server_address !== undefined ? data.server_address : current.server_address,
		};

		await settingModel.query().where("id", "wireguard-config").patch({
			meta: JSON.stringify(newMeta),
		});

		// Re-sync and apply config if WG is available
		if (isWgAvailable()) {
			await syncConfig();
			await applyConfig();
		}

		logger.info("WireGuard: Settings updated", newMeta);
		return newMeta;
	},

	/**
	 * Get server information
	 * @returns {Promise<Object>}
	 */
	getServerInfo: async () => {
		const settings = await getWgSettings();

		if (!isWgAvailable()) {
			return {
				available: false,
				publicKey: null,
				endpoint: settings.endpoint || null,
				listenPort: settings.listen_port,
				subnet: settings.subnet,
				interfaceUp: false,
			};
		}

		try {
			ensureServerKeys();
			const publicKey = getServerPublicKey();
			const endpointDisplay = settings.endpoint
				? `${settings.endpoint}:${settings.listen_port}`
				: null;

			return {
				available: true,
				publicKey,
				endpoint: endpointDisplay,
				listenPort: settings.listen_port,
				subnet: settings.subnet,
				interfaceUp: isInterfaceUp(),
			};
		} catch (err) {
			logger.error("WireGuard: Failed to get server info:", err.message);
			return {
				available: false,
				publicKey: null,
				endpoint: null,
				listenPort: settings.listen_port,
				subnet: settings.subnet,
				interfaceUp: false,
			};
		}
	},

	/**
	 * Create a new WireGuard peer
	 * @param {Object} data - { name, description, allowed_ips, persistent_keepalive, dns }
	 * @param {number} ownerUserId
	 * @returns {Promise<Object>} Created peer with client config
	 */
	createPeer: async (data, ownerUserId) => {
		if (!isWgAvailable()) {
			throw new Error("WireGuard is not available on this system");
		}

		ensureServerKeys();
		const settings = await getWgSettings();

		// Generate keys
		const clientKeys = generateKeyPair();
		const presharedKey = generatePresharedKey();
		const serverPublicKey = getServerPublicKey();
		const clientAddress = await getNextAvailableIP(settings.subnet);
		const endpoint = settings.endpoint
			? `${settings.endpoint}:${settings.listen_port}`
			: null;

		// Insert peer into DB
		const peerData = {
			name: data.name,
			description: data.description || null,
			client_address: clientAddress,
			client_public_key: clientKeys.publicKey,
			client_private_key: clientKeys.privateKey,
			preshared_key: presharedKey,
			server_public_key: serverPublicKey,
			endpoint: endpoint,
			allowed_ips: data.allowed_ips || settings.subnet,
			persistent_keepalive: data.persistent_keepalive || 25,
			dns: data.dns || "1.1.1.1",
			status: 2, // Online (active)
			owner_user_id: ownerUserId,
			meta: {},
		};

		const peer = await WireguardPeer.query().insert(peerData);

		// Sync and apply config
		await syncConfig();
		await applyConfig();

		// Refetch with decrypted keys
		const createdPeer = await WireguardPeer.query().findById(peer.id);

		logger.info(`WireGuard: Peer "${data.name}" created with IP ${clientAddress}`);

		return createdPeer;
	},

	/**
	 * Update a WireGuard peer
	 * @param {number} peerId
	 * @param {Object} data
	 * @returns {Promise<Object>}
	 */
	updatePeer: async (peerId, data) => {
		const peer = await WireguardPeer.query().findById(peerId).where("is_deleted", 0);
		if (!peer) {
			throw new Error("Peer not found");
		}

		const updateData = {};
		if (data.name !== undefined) updateData.name = data.name;
		if (data.description !== undefined) updateData.description = data.description;
		if (data.allowed_ips !== undefined) updateData.allowed_ips = data.allowed_ips;
		if (data.persistent_keepalive !== undefined) updateData.persistent_keepalive = data.persistent_keepalive;
		if (data.dns !== undefined) updateData.dns = data.dns;

		const updated = await peer.$query().patchAndFetch(updateData);

		// Re-sync config if relevant fields changed
		await syncConfig();
		await applyConfig();

		logger.info(`WireGuard: Peer "${updated.name}" (ID: ${peerId}) updated`);
		return updated;
	},

	/**
	 * Delete a WireGuard peer
	 * @param {number} peerId
	 * @returns {Promise<boolean>}
	 */
	deletePeer: async (peerId) => {
		const peer = await WireguardPeer.query().findById(peerId);
		if (!peer) {
			return false;
		}

		await peer.$query().delete();

		// Re-sync config
		await syncConfig();
		await applyConfig();

		logger.info(`WireGuard: Peer "${peer.name}" (ID: ${peerId}) deleted`);
		return true;
	},

	/**
	 * Enable a peer
	 * @param {number} peerId
	 * @returns {Promise<Object>}
	 */
	enablePeer: async (peerId) => {
		const peer = await WireguardPeer.query().findById(peerId).where("is_deleted", 0);
		if (!peer) {
			throw new Error("Peer not found");
		}

		await peer.$query().patch({ status: 2 });

		await syncConfig();
		await applyConfig();

		logger.info(`WireGuard: Peer "${peer.name}" enabled`);
		return await WireguardPeer.query().findById(peerId);
	},

	/**
	 * Disable a peer
	 * @param {number} peerId
	 * @returns {Promise<Object>}
	 */
	disablePeer: async (peerId) => {
		const peer = await WireguardPeer.query().findById(peerId).where("is_deleted", 0);
		if (!peer) {
			throw new Error("Peer not found");
		}

		await peer.$query().patch({ status: 0 });

		await syncConfig();
		await applyConfig();

		logger.info(`WireGuard: Peer "${peer.name}" disabled`);
		return await WireguardPeer.query().findById(peerId);
	},

	/**
	 * Generate a WireGuard client configuration string
	 * @param {number} peerId
	 * @returns {Promise<string>}
	 */
	generateClientConfig: async (peerId) => {
		const peer = await WireguardPeer.query().findById(peerId).where("is_deleted", 0);
		if (!peer) {
			throw new Error("Peer not found");
		}

		const settings = await getWgSettings();
		const endpointLine = peer.endpoint
			? `Endpoint = ${peer.endpoint}`
			: `# Endpoint = <your-server-ip>:${settings.listen_port}`;

		const config = `[Interface]
PrivateKey = ${peer.client_private_key}
Address = ${peer.client_address}
${peer.dns ? `DNS = ${peer.dns}` : ""}

[Peer]
PublicKey = ${peer.server_public_key}
PresharedKey = ${peer.preshared_key}
${endpointLine}
AllowedIPs = ${peer.allowed_ips}
PersistentKeepalive = ${peer.persistent_keepalive}
`;

		return config;
	},

	/**
	 * Generate QR code as data URL for peer config (using npm qrcode package)
	 * @param {number} peerId
	 * @returns {Promise<string>} data:image/png;base64 URL
	 */
	generateQRCode: async (peerId) => {
		const config = await internalWireguard.generateClientConfig(peerId);

		try {
			const QRCode = await import("qrcode");
			const dataUrl = await QRCode.default.toDataURL(config, {
				width: 512,
				margin: 2,
				color: { dark: "#000000", light: "#ffffff" },
			});
			return dataUrl;
		} catch (err) {
			logger.error("WireGuard: QR code generation failed:", err.message);
			throw new Error("QR code generation is not available. Ensure the 'qrcode' npm package is installed.");
		}
	},

	/**
	 * Refresh peer statuses from live WireGuard data
	 */
	refreshStatuses: async () => {
		if (!isInterfaceUp()) return;

		const statuses = parsePeerStatuses();
		const peers = await WireguardPeer.query().where("is_deleted", 0).andWhere("status", "!=", 0);

		for (const peer of peers) {
			const status = statuses.get(peer.client_public_key);
			if (status) {
				const patchData = {
					transfer_rx: status.transferRx,
					transfer_tx: status.transferTx,
				};

				// A handshake within the last 3 minutes means the peer is "online"
				if (status.lastHandshake > 0) {
					patchData.last_handshake = new Date(status.lastHandshake * 1000).toISOString();
				}

				await peer.$query().patch(patchData);
			}
		}
	},

	/**
	 * Get all peer statuses with live data
	 * @returns {Promise<Map>}
	 */
	getAllPeerStatuses: async () => {
		if (!isInterfaceUp()) return new Map();
		return parsePeerStatuses();
	},
};

export default internalWireguard;
