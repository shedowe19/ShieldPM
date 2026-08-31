#!/usr/bin/env node

import app from "./app.js";
import analyticsService from "./internal/analytics.js";
import internalCertificate from "./internal/certificate.js";
import internalIpRanges from "./internal/ip_ranges.js";
import internalNginx from "./internal/nginx.js";
import utils from "./lib/utils.js";
import { global as logger } from "./logger.js";
import { migrateUp } from "./migrate.js";
import { getCompiledSchema } from "./schema/index.js";
import setup from "./setup.js";

// Monkey patch internalNginx
internalNginx.test = async () => true;
internalNginx.reload = async () => {
	logger.info("MOCK: Nginx reload called");
	return true;
};
internalNginx.getConfigName = (host_type, host_id) => {
	const dataPath = process.env.DATA_PATH;
	if (host_type === "default") {
		return `${dataPath}/nginx/default.conf`;
	}
	return `${dataPath}/nginx/${internalNginx.getFileFriendlyHostType(host_type)}/${host_id}.conf`;
};
internalNginx.deleteFile = async (filename) => {
	logger.info(`MOCK: Deleting file ${filename}`);
};
internalNginx.deleteConfig = async (host_type, _host) => {
	logger.info(`MOCK: Delete config for ${host_type}`);
};

// Monkey patch utils.execFile
const originalExecFile = utils.execFile;
utils.execFile = async (cmd, args) => {
	if (["nginx", "certbot", "nginxbeautifier", "pip"].includes(cmd) || cmd.includes("certbot-ocsp-fetcher")) {
		logger.info(`MOCK: execFile ${cmd} ${args}`);
		return "";
	}
	return originalExecFile(cmd, args);
};

// Monkey patch internalCertificate timers
internalCertificate.initTimer = () => {
	logger.info("MOCK: Certificate timer init");
};

// Monkey patch internalIpRanges
internalIpRanges.initTimer = () => {
	logger.info("MOCK: IP Ranges timer init");
};
internalIpRanges.fetch = async () => {
	logger.info("MOCK: IP Ranges fetch");
};

async function start() {
	try {
		logger.info("Starting DB Migration...");
		await migrateUp();
		const analyticsInitialized = await analyticsService.init();
		if (!analyticsInitialized) throw new Error("Analytics durable spool initialization failed");
		logger.info("Starting Setup...");
		await setup();
		logger.info("Compiling Schema...");
		await getCompiledSchema();

		const port = 3000;
		const server = app.listen(port, () => {
			logger.info(`Backend listening on port ${port}`);
			logger.info("Complete the one-time ownership claim in the setup wizard before signing in.");
		});
		let stopping = false;
		const shutdown = async () => {
			if (stopping) return;
			stopping = true;
			await analyticsService.stop();
			await new Promise((resolve, reject) => {
				server.close((err) => (err ? reject(err) : resolve()));
			});
		};
		process.once("SIGTERM", () => void shutdown());
		process.once("SIGINT", () => void shutdown());
	} catch (err) {
		logger.error("Startup Error", err);
		process.exit(1);
	}
}

start();
