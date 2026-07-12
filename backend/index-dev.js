#!/usr/bin/env node

process.env.DATA_PATH = `${process.cwd()}/data`;
process.env.INITIAL_ADMIN_EMAIL = "admin@example.com";
process.env.INITIAL_ADMIN_PASSWORD = "changeme";
process.env.INITIAL_DEFAULT_PAGE = "congratulations";

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
		await analyticsService.init();
		logger.info("Starting Setup...");
		await setup();
		logger.info("Compiling Schema...");
		await getCompiledSchema();

		const port = 3000;
		app.listen(port, () => {
			logger.info(`Backend listening on port ${port}`);
			logger.info(`Admin: ${process.env.INITIAL_ADMIN_EMAIL} / ${process.env.INITIAL_ADMIN_PASSWORD}`);
		});
	} catch (err) {
		logger.error("Startup Error", err);
		process.exit(1);
	}
}

start();
