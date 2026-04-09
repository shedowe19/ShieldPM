import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import express from "express";
import { Model, transaction } from "objection";

import { global as logger } from "../logger.js";
import internalNginx from "./nginx.js";
import db from "../db.js";
import { decrypt, encrypt } from "../lib/encryption.js";
import internalAuditLog from "./audit-log.js";
import apiValidator from "../lib/validator/api.js";
import { getValidationSchema } from "../schema/index.js";
import jwtdecode from "../lib/express/jwt-decode.js";

const execAsync = promisify(exec);

const ADDON_DIR = "/data/addons";
const ADDON_STORE_URL = process.env.ADDON_STORE_URL || "https://raw.githubusercontent.com/shedowe19/shieldpm-addons/master/store.json";

const loadedAddons = new Map();
let appReference = null;

const internalAddons = {
	init: async (app) => {
		logger.info("Initializing Addons Manager...");
        appReference = app;

		if (!existsSync(ADDON_DIR)) {
			await fs.mkdir(ADDON_DIR, { recursive: true });
			logger.info(`Created Addon directory at ${ADDON_DIR}`);
		}

		// Register static files for frontend injection
		app.use("/api/addons/static", express.static(ADDON_DIR));
		
		// MVP ONLY: Serve the external sibling addon repo statically
		app.use("/api/addons/test-registry", express.static(path.join(process.cwd(), "..", "shieldpm-addons")));

		// Load installed addons
		const dirs = await fs.readdir(ADDON_DIR, { withFileTypes: true });
		for (const dirent of dirs) {
			if (dirent.isDirectory()) {
				await internalAddons.loadAddon(dirent.name, app);
			}
		}
	},

	loadAddon: async (id, app) => {
		const manifestPath = path.join(ADDON_DIR, id, "manifest.json");
		const backendEntry = path.join(ADDON_DIR, id, "backend", "index.js");

		if (!existsSync(manifestPath)) {
			return;
		}

		try {
			const manifestStr = await fs.readFile(manifestPath, "utf-8");
			const manifest = JSON.parse(manifestStr);

			logger.info(`Loading Addon: ${manifest.name} (${manifest.version})`);

			if (existsSync(backendEntry)) {
				const addonModule = await import(`file://${backendEntry}`);
				if (typeof addonModule.default === "function") {
					await addonModule.default({
						app,
						logger,
						database: db,
						objection: { Model, transaction },
						encryption: { encrypt, decrypt },
						auditLog: internalAuditLog,
						validator: apiValidator,
						schema: { getValidationSchema },
						jwt: jwtdecode,
						backendCore: { internalNginx }
					});
				}
			}

			loadedAddons.set(id, manifest);
			logger.info(`Successfully loaded Addon: ${manifest.name}`);
		} catch (err) {
			logger.error(`Failed to load Addon ${id}: ${err.message}`, err);
		}
	},

	router: () => {
		const router = express.Router();

		// List available addons from "Registry"
		router.get("/store", async (req, res) => {
			try {
				const response = await fetch(ADDON_STORE_URL);
				if (!response.ok) {
					throw new Error(`Failed to fetch addon registry: ${response.statusText}`);
				}
				const storeData = await response.json();
				res.json(storeData);
			} catch (err) {
				logger.error(`Failed to fetch addon store: ${err.message}`);
				res.status(500).json({ error: err.message });
			}
		});

		// List installed addons
		router.get("/installed", (req, res) => {
			const installed = [];
			for (const [id, manifest] of loadedAddons.entries()) {
				installed.push({ id, ...manifest });
			}
			res.json(installed);
		});

		// Install an addon
		router.post("/install", async (req, res) => {
			const { id, url } = req.body;
			if (!id || !url) {
				return res.status(400).json({ error: "Missing addon id or url" });
			}

			try {
				logger.info(`Installing Addon [${id}] from ${url}...`);
				const tempZipPath = path.join("/tmp", `${id}.addon`);
				const extractPath = path.join(ADDON_DIR, id);

				const response = await fetch(url);
				if (!response.ok) throw new Error(`Failed to download addon: ${response.statusText}`);

				const arrayBuffer = await response.arrayBuffer();
				await fs.writeFile(tempZipPath, Buffer.from(arrayBuffer));

				if (existsSync(extractPath)) {
					await fs.rm(extractPath, { recursive: true, force: true });
				}
				await fs.mkdir(extractPath, { recursive: true });

				await execAsync(`unzip -o ${tempZipPath} -d ${extractPath}`);
				await fs.unlink(tempZipPath);

				await internalAddons.loadAddon(id, appReference);

				res.json({ success: true, message: "Addon installed." });
			} catch (err) {
				logger.error(`Addon Installation Failed [${id}]: ${err.message}`, err);
				res.status(500).json({ error: err.message });
			}
		});

		// Uninstall an addon
		router.delete("/:id", async (req, res) => {
			const { id } = req.params;
			const extractPath = path.join(ADDON_DIR, id);

			try {
				if (existsSync(extractPath)) {
					await fs.rm(extractPath, { recursive: true, force: true });
				}
				loadedAddons.delete(id);
				res.json({ success: true, message: "Addon uninstalled." });
			} catch (err) {
				logger.error(`Addon Uninstallation Failed [${id}]: ${err.message}`);
				res.status(500).json({ error: err.message });
			}
		});

		return router;
	}
};

export default internalAddons;
