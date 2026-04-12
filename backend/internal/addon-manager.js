import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { global as logger } from "../logger.js";

const DATA_PATH = process.env.DATA_PATH || "/data";
const ADDONS_PATH = path.join(DATA_PATH, "addons");
const REGISTRY_URL = "https://raw.githubusercontent.com/shedowe19/shieldpm-addons/main/registry.json";

// Maps Node.js process.arch → Linux arch string used in release URLs
const ARCH_MAP = {
	x64: "amd64",
	arm64: "arm64",
	arm: "arm",
};

/**
 * Returns the Linux architecture string for the current process.
 * @returns {string}
 */
const getArch = () => ARCH_MAP[process.arch] || process.arch;

/**
 * Returns the full path to an addon's installed binary (binary-type addons only).
 * @param {string} addonId
 * @param {string} [binaryName] - defaults to addonId
 * @returns {string}
 */
const getBinaryPath = (addonId, binaryName) =>
	path.join(ADDONS_PATH, addonId, "bin", binaryName || addonId);

/**
 * Returns true if the addon is installed.
 * - binary addons: checks /data/addons/<id>/bin/<name> is executable
 * - apt addons:    checks /data/addons/<id>/manifest.json exists (written after apt-get install)
 * @param {string} addonId
 * @param {string} [binaryName]
 * @returns {boolean}
 */
const isInstalled = (addonId, binaryName) => {
	// Check addon binary path (binary-type addons)
	try {
		fs.accessSync(getBinaryPath(addonId, binaryName), fs.constants.X_OK);
		return true;
	} catch {
		// Check manifest presence (apt-type addons or manual installs)
		return fs.existsSync(path.join(ADDONS_PATH, addonId, "manifest.json"));
	}
};

/**
 * Fetches the addon registry from the shieldpm-addons repo.
 * @returns {Promise<{ version: string, addons: Object[] }>}
 */
const fetchRegistry = async () => {
	const res = await fetch(REGISTRY_URL, {
		headers: { "User-Agent": "ShieldPM-AddonManager/1.0" },
		signal: AbortSignal.timeout(15_000),
	});
	if (!res.ok) {
		throw new Error(`Failed to fetch addon registry: HTTP ${res.status}`);
	}
	return res.json();
};

/**
 * Installs a binary addon by downloading it from the registry.
 * @param {Object} manifest
 * @param {string} arch
 * @returns {Promise<string>} path to installed binary
 */
const installBinary = async (manifest, arch) => {
	const { id, binary_name, binaries, binary_extract_path, archive_type = "tar.gz" } = manifest;
	const downloadUrl = binaries?.[arch];

	if (!downloadUrl) {
		throw new Error(`Addon "${id}" has no binary for architecture "${arch}"`);
	}

	const addonBinDir = path.join(ADDONS_PATH, id, "bin");
	fs.mkdirSync(addonBinDir, { recursive: true });

	const binaryName = binary_name || id;
	const destPath = path.join(addonBinDir, binaryName);

	logger.info(`[AddonManager] Downloading "${id}" (${arch}) from ${downloadUrl}`);

	const res = await fetch(downloadUrl, {
		headers: { "User-Agent": "ShieldPM-AddonManager/1.0" },
		signal: AbortSignal.timeout(120_000),
	});
	if (!res.ok) {
		throw new Error(`Download failed for addon "${id}": HTTP ${res.status}`);
	}

	if (archive_type === "tar.gz") {
		const tmpFile = path.join("/tmp", `shieldpm-addon-${id}-${arch}-${Date.now()}.tar.gz`);
		const fileStream = fs.createWriteStream(tmpFile);

		for await (const chunk of res.body) {
			fileStream.write(chunk);
		}
		await new Promise((resolve, reject) => {
			fileStream.end();
			fileStream.on("finish", resolve);
			fileStream.on("error", reject);
		});

		try {
			const extractPath = binary_extract_path.replace(/\{arch\}/g, arch);
			const depth = extractPath.split("/").length - 1;

			execFileSync("tar", ["-xzf", tmpFile, "-C", addonBinDir, `--strip-components=${depth}`, extractPath], {
				timeout: 30_000,
			});

			const extractedName = path.basename(extractPath);
			if (extractedName !== binaryName) {
				fs.renameSync(path.join(addonBinDir, extractedName), destPath);
			}
		} finally {
			try {
				fs.unlinkSync(tmpFile);
			} catch {
				// ignore cleanup errors
			}
		}
	} else {
		// Direct binary download
		const fileStream = fs.createWriteStream(destPath);
		for await (const chunk of res.body) {
			fileStream.write(chunk);
		}
		await new Promise((resolve, reject) => {
			fileStream.end();
			fileStream.on("finish", resolve);
			fileStream.on("error", reject);
		});
	}

	fs.chmodSync(destPath, 0o755);
	logger.info(`[AddonManager] "${id}" binary installed → ${destPath}`);
	return destPath;
};

/**
 * Installs an apt-type addon by running apt-get install.
 * Requires the container to run as root (default for ShieldPM).
 * @param {Object} manifest
 */
const installApt = (manifest) => {
	const { id, apt_packages } = manifest;

	if (!Array.isArray(apt_packages) || apt_packages.length === 0) {
		throw new Error(`Addon "${id}" has no apt_packages defined`);
	}

	logger.info(`[AddonManager] Installing apt packages for "${id}": ${apt_packages.join(", ")}`);

	execFileSync("apt-get", ["install", "-y", "--no-install-recommends", ...apt_packages], {
		timeout: 180_000,
		stdio: "pipe",
	});

	logger.info(`[AddonManager] apt packages installed for "${id}"`);

	// Ensure addon directory exists so the manifest can be written
	fs.mkdirSync(path.join(ADDONS_PATH, id), { recursive: true });
};

/**
 * Downloads and installs an addon from its manifest.
 *
 * Supported manifest types:
 *
 *   binary (tar.gz):
 *     { id, type:"binary", archive_type:"tar.gz", binaries:{amd64:…}, binary_extract_path:"…/{arch}/…" }
 *
 *   binary (direct):
 *     { id, type:"binary", archive_type:"binary", binaries:{amd64:…} }
 *
 *   apt:
 *     { id, type:"apt", apt_packages:["wireguard-tools","wireguard-go","iproute2","iptables"] }
 *
 * @param {Object} manifest
 * @returns {Promise<string|null>} path to binary (binary type) or null (apt type)
 */
const install = async (manifest) => {
	const { id, type: addonType = "binary" } = manifest;
	const arch = getArch();

	logger.info(`[AddonManager] Installing "${id}" v${manifest.version} (type: ${addonType})`);

	let binaryPath = null;

	if (addonType === "apt") {
		installApt(manifest);
	} else {
		binaryPath = await installBinary(manifest, arch);
	}

	// Write the installed manifest so the UI and isInstalled() can detect it
	fs.writeFileSync(
		path.join(ADDONS_PATH, id, "manifest.json"),
		JSON.stringify(
			{
				...manifest,
				installed_at: new Date().toISOString(),
				installed_arch: addonType === "apt" ? null : arch,
				binary_path: binaryPath,
			},
			null,
			2,
		),
	);

	return binaryPath;
};

/**
 * Removes an installed addon.
 * For binary addons: deletes /data/addons/<id>/
 * For apt addons: removes the manifest only (packages remain until container restart).
 * @param {string} addonId
 */
const uninstall = (addonId) => {
	const addonDir = path.join(ADDONS_PATH, addonId);
	if (fs.existsSync(addonDir)) {
		fs.rmSync(addonDir, { recursive: true, force: true });
		logger.info(`[AddonManager] "${addonId}" uninstalled`);
	}
};

/**
 * Updates a single addon to the latest version from the registry.
 * Skips if already on the latest version.
 *
 * @param {string} addonId
 * @returns {Promise<{ updated: boolean, from?: string, to: string, reason?: string }>}
 */
const update = async (addonId) => {
	const registry = await fetchRegistry();
	const latest = registry.addons?.find((a) => a.id === addonId);

	if (!latest) {
		throw new Error(`Addon "${addonId}" not found in registry`);
	}

	const installed = getInstalledAddons().find((a) => a.id === addonId);

	if (installed?.version === latest.version) {
		logger.info(`[AddonManager] "${addonId}" is already at v${latest.version}`);
		return { updated: false, reason: "already_latest", to: latest.version };
	}

	logger.info(`[AddonManager] Updating "${addonId}" ${installed?.version ?? "?"} → ${latest.version}`);
	await install(latest);

	return { updated: true, from: installed?.version, to: latest.version };
};

/**
 * Updates all installed addons that have a newer version in the registry.
 * @returns {Promise<Array<{ id: string, updated: boolean, from?: string, to?: string, error?: string }>>}
 */
const updateAll = async () => {
	const installed = getInstalledAddons();
	if (installed.length === 0) return [];

	const registry = await fetchRegistry();
	const results = [];

	for (const addon of installed) {
		try {
			const latest = registry.addons?.find((a) => a.id === addon.id);
			if (!latest) {
				results.push({ id: addon.id, updated: false, reason: "not_in_registry" });
				continue;
			}
			if (addon.version === latest.version) {
				results.push({ id: addon.id, updated: false, reason: "already_latest", to: latest.version });
				continue;
			}
			logger.info(`[AddonManager] Updating "${addon.id}" ${addon.version} → ${latest.version}`);
			await install(latest);
			results.push({ id: addon.id, updated: true, from: addon.version, to: latest.version });
		} catch (err) {
			logger.error(`[AddonManager] Failed to update "${addon.id}":`, err.message);
			results.push({ id: addon.id, updated: false, error: err.message });
		}
	}

	return results;
};

/**
 * Returns a list of all installed addons by reading their manifest files.
 * @returns {Object[]}
 */
const getInstalledAddons = () => {
	if (!fs.existsSync(ADDONS_PATH)) return [];

	return fs
		.readdirSync(ADDONS_PATH, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => {
			const manifestPath = path.join(ADDONS_PATH, entry.name, "manifest.json");
			try {
				return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
			} catch {
				return null;
			}
		})
		.filter(Boolean);
};

const addonManager = {
	getArch,
	getBinaryPath,
	isInstalled,
	fetchRegistry,
	install,
	uninstall,
	update,
	updateAll,
	getInstalledAddons,

	init() {
		fs.mkdirSync(ADDONS_PATH, { recursive: true });
		logger.info(`[AddonManager] Ready — addon path: ${ADDONS_PATH}`);
	},
};

export default addonManager;
