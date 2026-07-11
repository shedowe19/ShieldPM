import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import ipaddr from "ipaddr.js";
import errs from "../lib/error.js";
import { global as logger } from "../logger.js";
import settingModel from "../models/setting.js";
import WireguardPeer from "../models/wireguard_peer.js";

const dataPath = process.env.DATA_PATH || "/data";
const wgDataDir = `${dataPath}/wireguard`;
const wgConfFile = `${wgDataDir}/wg0.conf`;
const serverKeyFile = `${wgDataDir}/server_private.key`;
const serverPubKeyFile = `${wgDataDir}/server_public.key`;

const WG_INTERFACE = "wg0";

const firewallCommands = {
	postUp: [
		"sysctl -w net.ipv4.conf.all.rp_filter=0",
		`sysctl -w net.ipv4.conf.${WG_INTERFACE}.rp_filter=0`,
		"iptables -N SHIELDPM_WG_INPUT 2>/dev/null || true",
		"iptables -N SHIELDPM_WG_FORWARD 2>/dev/null || true",
		"iptables -t nat -N SHIELDPM_WG_NAT 2>/dev/null || true",
		"iptables -t mangle -N SHIELDPM_WG_MANGLE_POST 2>/dev/null || true",
		"iptables -t mangle -N SHIELDPM_WG_MANGLE_FORWARD 2>/dev/null || true",
		"iptables -F SHIELDPM_WG_INPUT",
		"iptables -F SHIELDPM_WG_FORWARD",
		"iptables -t nat -F SHIELDPM_WG_NAT",
		"iptables -t mangle -F SHIELDPM_WG_MANGLE_POST",
		"iptables -t mangle -F SHIELDPM_WG_MANGLE_FORWARD",
		"iptables -C INPUT -j SHIELDPM_WG_INPUT 2>/dev/null || iptables -I INPUT -j SHIELDPM_WG_INPUT",
		"iptables -C FORWARD -j SHIELDPM_WG_FORWARD 2>/dev/null || iptables -I FORWARD -j SHIELDPM_WG_FORWARD",
		"iptables -t nat -C POSTROUTING -j SHIELDPM_WG_NAT 2>/dev/null || iptables -t nat -I POSTROUTING -j SHIELDPM_WG_NAT",
		"iptables -t mangle -C POSTROUTING -j SHIELDPM_WG_MANGLE_POST 2>/dev/null || iptables -t mangle -I POSTROUTING -j SHIELDPM_WG_MANGLE_POST",
		"iptables -t mangle -C FORWARD -j SHIELDPM_WG_MANGLE_FORWARD 2>/dev/null || iptables -t mangle -I FORWARD -j SHIELDPM_WG_MANGLE_FORWARD",
		`iptables -A SHIELDPM_WG_INPUT -i ${WG_INTERFACE} -j ACCEPT`,
		`iptables -A SHIELDPM_WG_FORWARD -i ${WG_INTERFACE} -j ACCEPT`,
		"iptables -t nat -A SHIELDPM_WG_NAT -o eth0 -j MASQUERADE",
		`iptables -t mangle -A SHIELDPM_WG_MANGLE_POST -o ${WG_INTERFACE} -p tcp -m tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu`,
		`iptables -t mangle -A SHIELDPM_WG_MANGLE_FORWARD -i ${WG_INTERFACE} -p tcp -m tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu`,
	].join("; "),
	postDown: [
		// Legacy direct rules have no provenance, so only named ShieldPM chains are removed.
		"iptables -D INPUT -j SHIELDPM_WG_INPUT 2>/dev/null || true",
		"iptables -D FORWARD -j SHIELDPM_WG_FORWARD 2>/dev/null || true",
		"iptables -t nat -D POSTROUTING -j SHIELDPM_WG_NAT 2>/dev/null || true",
		"iptables -t mangle -D POSTROUTING -j SHIELDPM_WG_MANGLE_POST 2>/dev/null || true",
		"iptables -t mangle -D FORWARD -j SHIELDPM_WG_MANGLE_FORWARD 2>/dev/null || true",
		"iptables -F SHIELDPM_WG_INPUT 2>/dev/null || true",
		"iptables -F SHIELDPM_WG_FORWARD 2>/dev/null || true",
		"iptables -t nat -F SHIELDPM_WG_NAT 2>/dev/null || true",
		"iptables -t mangle -F SHIELDPM_WG_MANGLE_POST 2>/dev/null || true",
		"iptables -t mangle -F SHIELDPM_WG_MANGLE_FORWARD 2>/dev/null || true",
		"iptables -X SHIELDPM_WG_INPUT 2>/dev/null || true",
		"iptables -X SHIELDPM_WG_FORWARD 2>/dev/null || true",
		"iptables -t nat -X SHIELDPM_WG_NAT 2>/dev/null || true",
		"iptables -t mangle -X SHIELDPM_WG_MANGLE_POST 2>/dev/null || true",
		"iptables -t mangle -X SHIELDPM_WG_MANGLE_FORWARD 2>/dev/null || true",
	].join("; "),
};

// Defaults — overridden by settings from DB
const DEFAULTS = {
	endpoint: "",
	listen_port: 51820,
	subnet: "10.8.0.0/24",
	server_address: "10.8.0.1/24",
};

const WIREGUARD_SETTING_KEYS = new Set(["endpoint", "listen_port", "subnet", "server_address"]);
const hostnamePattern =
	/^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$/;

const hasControlCharacters = (value) => {
	for (const character of value) {
		const codePoint = character.codePointAt(0);
		if (codePoint <= 0x1f || codePoint === 0x7f) return true;
	}
	return false;
};

const validateIpv4Cidr = (value, field) => {
	if (typeof value !== "string" || value.trim() !== value || hasControlCharacters(value)) {
		throw new errs.ValidationError(`WireGuard ${field} must be an IPv4 CIDR.`);
	}

	try {
		const [address, prefix] = ipaddr.IPv4.parseCIDR(value);
		if (prefix !== 24) {
			throw new errs.ValidationError(`WireGuard ${field} must be an IPv4 /24 CIDR.`);
		}
		return [address, prefix];
	} catch (err) {
		if (err instanceof errs.ValidationError) throw err;
		throw new errs.ValidationError(`WireGuard ${field} must be an IPv4 CIDR.`);
	}
};

/**
 * Validate server settings before they are stored or rendered into wg0.conf.
 * @param {Object} data
 * @param {{ requireValues?: boolean }} options
 * @returns {Object}
 */
const validateWireguardSettings = (data, { requireValues = false } = {}) => {
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		throw new errs.ValidationError("WireGuard settings must be an object.");
	}

	const keys = Object.keys(data);
	if (requireValues && keys.length === 0) {
		throw new errs.ValidationError("At least one WireGuard setting is required.");
	}

	for (const key of keys) {
		if (!WIREGUARD_SETTING_KEYS.has(key)) {
			throw new errs.ValidationError(`Unsupported WireGuard setting: ${key}`);
		}
	}

	if (data.endpoint !== undefined) {
		if (
			typeof data.endpoint !== "string" ||
			data.endpoint.trim() !== data.endpoint ||
			hasControlCharacters(data.endpoint) ||
			(data.endpoint !== "" && !ipaddr.isValid(data.endpoint) && !hostnamePattern.test(data.endpoint))
		) {
			throw new errs.ValidationError("WireGuard endpoint must be an IP address, hostname, or empty.");
		}
	}

	if (
		data.listen_port !== undefined &&
		(!Number.isInteger(data.listen_port) || data.listen_port < 1 || data.listen_port > 65535)
	) {
		throw new errs.ValidationError("WireGuard listen_port must be an integer from 1 to 65535.");
	}

	const subnet = data.subnet === undefined ? null : validateIpv4Cidr(data.subnet, "subnet");
	const serverAddress =
		data.server_address === undefined ? null : validateIpv4Cidr(data.server_address, "server_address");
	if (subnet && serverAddress && (subnet[1] !== serverAddress[1] || !serverAddress[0].match(subnet))) {
		throw new errs.ValidationError("WireGuard server_address must belong to the configured subnet.");
	}

	return data;
};

const formatEndpoint = (endpoint, port) => {
	if (!endpoint) return null;
	return `${ipaddr.isValid(endpoint) && ipaddr.parse(endpoint).kind() === "ipv6" ? `[${endpoint}]` : endpoint}:${port}`;
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
			const settings = {
				endpoint: meta.endpoint || DEFAULTS.endpoint,
				listen_port: meta.listen_port || DEFAULTS.listen_port,
				subnet: meta.subnet || DEFAULTS.subnet,
				server_address: meta.server_address || DEFAULTS.server_address,
			};
			return validateWireguardSettings(settings);
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
 * @param {boolean} silent - Whether to suppress error logging (e.g., for probes)
 * @returns {string}
 */
const exec = (cmd, silent = false) => {
	try {
		return execSync(cmd, { encoding: "utf-8", timeout: 10000 }).trim();
	} catch (err) {
		if (!silent) {
			logger.error(`WireGuard exec failed: ${cmd}`, err.message);
		}
		throw err;
	}
};
/**
 * Execute a command with data piped via stdin (no shell expansion).
 * Prevents command injection when stdin data is untrusted.
 * @param {string} command - The command to run (no shell metacharacters)
 * @param {string} stdinData - Data to pipe into stdin
 * @param {boolean} silent - Suppress error logging
 * @returns {Promise<string>}
 */
const execStdin = (command, stdinData, silent = false) => {
	return new Promise((resolve, reject) => {
		const [cmd, ...args] = command.split(" ");
		const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (data) => {
			stdout += data.toString();
		});
		child.stderr.on("data", (data) => {
			stderr += data.toString();
		});
		child.on("close", (code) => {
			if (code === 0) {
				resolve(stdout.trim());
			} else {
				if (!silent) {
					logger.error(`WireGuard execStdin failed: ${command}`, stderr || "non-zero exit");
				}
				reject(new Error(`execStdin failed: ${command}`));
			}
		});
		child.on("error", (err) => {
			if (!silent) {
				logger.error(`WireGuard execStdin error: ${command}`, err.message);
			}
			reject(err);
		});

		child.stdin.write(stdinData);
		child.stdin.end();
	});
};

/**
 * Check if `wg` CLI is available
 * @returns {boolean}
 */
const isWgAvailable = () => {
	try {
		exec("which wg", true);
		return true;
	} catch {
		return false;
	}
};

/**
 * Generate a WireGuard key pair
 * @returns {{ privateKey: string, publicKey: string }}
 */
const generateKeyPair = async () => {
	const privateKey = exec("wg genkey");
	const publicKey = await execStdin("wg pubkey", privateKey);
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
const ensureServerKeys = async () => {
	if (!fs.existsSync(wgDataDir)) {
		fs.mkdirSync(wgDataDir, { recursive: true });
	}

	if (!fs.existsSync(serverKeyFile)) {
		logger.info("WireGuard: Generating new server key pair...");
		const { privateKey, publicKey } = await generateKeyPair();
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
const getServerPublicKey = async () => {
	if (fs.existsSync(serverPubKeyFile)) {
		return fs.readFileSync(serverPubKeyFile, "utf-8").trim();
	}
	// Derive from private key
	const privateKey = getServerPrivateKey();
	const publicKey = await execStdin("wg pubkey", privateKey);
	await fs.promises.writeFile(serverPubKeyFile, publicKey, { mode: 0o644 });
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
MTU = 1300
SaveConfig = false
`;

	// Isolate all WireGuard rules in dedicated chains so foreign firewall rules are never flushed or removed.
	config += `PostUp = ${firewallCommands.postUp}
PostDown = ${firewallCommands.postDown}
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
		// Pass silent=true so we don't log errors when the interface is legitimately down
		exec(`ip link show ${WG_INTERFACE} > /dev/null 2>&1`, true);
		return true;
	} catch {
		return false;
	}
};

/**
 * Bring the WG interface up or reload it
 * @param {boolean} forceRestart
 */
const applyConfig = async (forceRestart = false) => {
	try {
		const envPrefix = "WG_QUICK_USERSPACE_IMPLEMENTATION=wireguard-go";

		if (!forceRestart && isInterfaceUp()) {
			// Sync config without restarting (graceful)
			exec(`bash -c "wg syncconf ${WG_INTERFACE} <(wg-quick strip ${wgConfFile})"`);
			logger.info("WireGuard: Interface config synced");
		} else {
			// Full restart if forced or down
			if (isInterfaceUp()) {
				exec(`wg-quick down ${wgConfFile} 2>/dev/null || true`, true);
			}
			exec(`${envPrefix} wg-quick up ${wgConfFile}`);
			logger.info(forceRestart ? "WireGuard: Interface restarted" : "WireGuard: Interface brought up");
		}
	} catch (err) {
		logger.error("WireGuard: Failed to apply config:", err.message);
		// Try a fallback restart
		try {
			exec(`wg-quick down ${wgConfFile} 2>/dev/null || true`, true);
			const envPrefix = "WG_QUICK_USERSPACE_IMPLEMENTATION=wireguard-go";
			exec(`${envPrefix} wg-quick up ${wgConfFile}`);
			logger.info("WireGuard: Interface fallback restart successful");
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
		// Use absolute path in case systemd/Node lacks /usr/bin in $PATH somehow
		const output = exec(`/usr/bin/wg show ${WG_INTERFACE} dump`);
		const lines = output.split("\n");

		// Skip the first line (interface info)
		for (let i = 1; i < lines.length; i++) {
			const parts = lines[i].split("\t");
			if (parts.length >= 7) {
				const publicKey = parts[0];
				const lastHandshake = Number.parseInt(parts[4], 10) || 0;
				const transferRx = Number.parseInt(parts[5], 10) || 0;
				const transferTx = Number.parseInt(parts[6], 10) || 0;
				statuses.set(publicKey, { lastHandshake, transferRx, transferTx });
			}
		}
	} catch (err) {
		logger.error(`WireGuard: parsePeerStatuses failed: ${err.message}`);
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
			await ensureServerKeys();

			// Reset all peer statuses on boot
			const peers = await WireguardPeer.query().where("is_deleted", 0);
			if (peers.length > 0) {
				// Re-enable all non-deleted peers
				await WireguardPeer.query().patch({ status: 2 }).where("is_deleted", 0);
			}

			// Write config and force restart interface to apply PostUp rules
			await syncConfig();
			await applyConfig(true);

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
		validateWireguardSettings(data, { requireValues: true });
		const current = await getWgSettings();
		const newMeta = {
			endpoint: data.endpoint !== undefined ? data.endpoint : current.endpoint,
			listen_port: data.listen_port !== undefined ? data.listen_port : current.listen_port,
			subnet: data.subnet !== undefined ? data.subnet : current.subnet,
			server_address: data.server_address !== undefined ? data.server_address : current.server_address,
		};
		validateWireguardSettings(newMeta);

		await settingModel
			.query()
			.where("id", "wireguard-config")
			.patch({
				meta: JSON.stringify(newMeta),
			});

		// If endpoint or port changed, update all existing peers' endpoint field to stay in sync
		if (data.endpoint !== undefined || data.listen_port !== undefined) {
			const peers = await WireguardPeer.query().where("is_deleted", 0);
			const newEndpoint = formatEndpoint(newMeta.endpoint, newMeta.listen_port);

			for (const peer of peers) {
				await WireguardPeer.query().findById(peer.id).patch({
					endpoint: newEndpoint,
				});
			}
			logger.info(`WireGuard: Updated endpoint for ${peers.length} peer(s) to ${newEndpoint}`);
		}

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
			await ensureServerKeys();
			const publicKey = await getServerPublicKey();
			const endpointDisplay = formatEndpoint(settings.endpoint, settings.listen_port);

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

		await ensureServerKeys();
		const settings = await getWgSettings();

		// Generate keys
		const clientKeys = await generateKeyPair();
		const presharedKey = generatePresharedKey();
		const serverPublicKey = await getServerPublicKey();
		const clientAddress = await getNextAvailableIP(settings.subnet);
		const endpoint = formatEndpoint(settings.endpoint, settings.listen_port);

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

		await peer.$query().patch({ is_deleted: 1 });

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

				// A handshake within the last 5 minutes means the peer is "online"
				if (status.lastHandshake > 0) {
					// Use native Date object. Knex will format it perfectly for the specific DB driver
					patchData.last_handshake = new Date(status.lastHandshake * 1000);
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
