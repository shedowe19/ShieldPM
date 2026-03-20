import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { global as logger } from "../../logger.js";
import ProxyHost from "../../models/proxy_host.js";
import TorOnion from "../../models/tor_onion.js";
import { buildConfigText, torDataPath, writeTorKeyFiles } from "./helpers.js";

const torService = {
	process: null,

	async regenerateTorConfig() {
		const onions = await TorOnion.query().where("is_deleted", 0);
		const services = [];
		for (const onion of onions) {
			const target = onion.forward_to || "127.0.0.1:80";
			const dir = path.join(torDataPath, String(onion.id));
			const token = onion.domain || crypto.randomBytes(12).toString("hex");
			const hostname = await writeTorKeyFiles(dir, token);
			if (!onion.domain) await TorOnion.query().patchAndFetchById(onion.id, { domain: hostname.replace(/\.onion$/, "") });
			services.push({ dir, target });
		}
		await fs.promises.mkdir(torDataPath, { recursive: true });
		const torrc = buildConfigText(services);
		await fs.promises.writeFile(path.join(torDataPath, "torrc"), torrc, "utf8");
		return torrc;
	},

	async start() {
		await torService.regenerateTorConfig();
		if (torService.process) return;
		const torrcPath = path.join(torDataPath, "torrc");
		torService.process = spawn("tor", ["-f", torrcPath], { stdio: ["ignore", "pipe", "pipe"] });
		torService.process.stdout.on("data", (d) => logger.info(`[tor] ${d.toString().trim()}`));
		torService.process.stderr.on("data", (d) => logger.warn(`[tor] ${d.toString().trim()}`));
		torService.process.on("exit", (code) => {
			logger.warn(`[tor] exited with code ${code}`);
			torService.process = null;
		});
	},

	async restart() {
		await torService.stop();
		await torService.start();
	},

	async stop() {
		if (!torService.process) return;
		torService.process.kill("SIGTERM");
		torService.process = null;
	},

	async syncFromHosts() {
		const hosts = await ProxyHost.query().where("is_deleted", 0).whereNotNull("domain_names");
		for (const host of hosts) {
			const wantsOnion = host.meta?.tor_enabled;
			const existing = await TorOnion.query().where("proxy_host_id", host.id).where("is_deleted", 0).first();
			if (wantsOnion && !existing) {
				await TorOnion.query().insert({ proxy_host_id: host.id, forward_to: `${host.forward_host}:${host.forward_port}` });
			} else if (!wantsOnion && existing) {
				await TorOnion.query().patchAndFetchById(existing.id, { is_deleted: 1 });
			}
		}
	},

	async init() {
		await torService.syncFromHosts();
		await torService.start();
	},
};

export default torService;
