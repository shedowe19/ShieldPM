import { execFileSync } from "node:child_process";
import fs from "node:fs";
import express from "express";
import jwt from "../lib/express/jwt.js";
import addonManager from "../internal/addon-manager.js";

/**
 * Checks whether a binary is reachable via PATH.
 * @param {string} name
 * @returns {boolean}
 */
const binaryExists = (name) => {
	try {
		execFileSync("which", [name], { stdio: "ignore", timeout: 3_000 });
		return true;
	} catch {
		return false;
	}
};

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * GET /api/addons
 * Returns all installed addons.
 */
router.get("/", jwt, (_req, res, next) => {
	try {
		res.status(200).json(addonManager.getInstalledAddons());
	} catch (err) {
		next(err);
	}
});

/**
 * GET /api/addons/status
 * Returns which optional features are available on this system.
 * Checks both addon-installed binaries (/data/addons/) and system packages.
 * Used by the frontend to conditionally show/hide menu items.
 */
router.get("/status", jwt, (_req, res, next) => {
	try {
		const dataPath = process.env.DATA_PATH || "/data";
		res.status(200).json({
			anubis:
				addonManager.isInstalled("anubis") || fs.existsSync("/usr/local/bin/anubis") || binaryExists("anubis"),
			cloudflared:
				addonManager.isInstalled("cloudflared") ||
				fs.existsSync("/usr/local/bin/cloudflared") ||
				binaryExists("cloudflared"),
			wireguard: binaryExists("wg"),
			tor: binaryExists("tor"),
			oauth2_proxy:
				addonManager.isInstalled("oauth2-proxy") ||
				fs.existsSync("/usr/local/bin/oauth2-proxy") ||
				binaryExists("oauth2-proxy"),
		});
	} catch (err) {
		next(err);
	}
});

/**
 * GET /api/addons/registry
 * Fetches the available addon list from the shieldpm-addons repo.
 */
router.get("/registry", jwt, async (_req, res, next) => {
	try {
		const registry = await addonManager.fetchRegistry();
		res.status(200).json(registry);
	} catch (err) {
		next(err);
	}
});

/**
 * POST /api/addons/update-all
 * Updates all installed addons that have a newer version in the registry.
 */
router.post("/update-all", jwt, async (_req, res, next) => {
	try {
		const results = await addonManager.updateAll();
		res.status(200).json(results);
	} catch (err) {
		next(err);
	}
});

/**
 * POST /api/addons/:id/install
 * Installs an addon binary from the registry manifest.
 * Body: the addon manifest object from the registry.
 */
router.post("/:id/install", jwt, async (req, res, next) => {
	try {
		const manifest = req.body;

		if (!manifest || manifest.id !== req.params.id) {
			return res.status(400).json({ error: { code: 400, message: "Invalid addon manifest" } });
		}
		if (!["binary", "apt"].includes(manifest.type)) {
			return res.status(400).json({ error: { code: 400, message: `Unsupported addon type: ${manifest.type}` } });
		}

		const binaryPath = await addonManager.install(manifest);
		res.status(200).json({ installed: true, binary_path: binaryPath });
	} catch (err) {
		next(err);
	}
});

/**
 * POST /api/addons/:id/update
 * Updates a single addon to the latest version from the registry.
 */
router.post("/:id/update", jwt, async (req, res, next) => {
	try {
		const result = await addonManager.update(req.params.id);
		res.status(200).json(result);
	} catch (err) {
		next(err);
	}
});

/**
 * DELETE /api/addons/:id
 * Uninstalls an addon.
 */
router.delete("/:id", jwt, async (req, res, next) => {
	try {
		addonManager.uninstall(req.params.id);
		res.status(200).json({ uninstalled: true });
	} catch (err) {
		next(err);
	}
});

export default router;
