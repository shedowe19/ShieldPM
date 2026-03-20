#!/usr/bin/env node

process.on("unhandledRejection", (reason, promise) => {
	logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
	logger.error("Uncaught Exception:", err);
	process.exit(1);
});

import app from "./app.js";
import internalCertificate from "./internal/certificate.js";
import internalChat from "./internal/chat.js";
import { cloudflaredService } from "./modules/cloudflared/index.js";
import { ddnsService } from "./modules/ddns/index.js";
import { dockerService } from "./modules/docker/index.js";
import internalGitDeploy from "./internal/git-deploy.js";
import internalGitOps from "./internal/gitops.js";
import internalIpRanges from "./internal/ip_ranges.js";
import { maintenanceService } from "./modules/maintenance/index.js";
import internalNginx from "./internal/nginx.js";
import { oauth2ProxyService } from "./modules/oauth2-proxy/index.js";
import internalTerminal from "./internal/terminal.js";
import internalTor from "./internal/tor.js";
import migrateFromSqliteToNewDb from "./lib/db-migrate.js";
import { global as logger } from "./logger.js";
import { migrateUp } from "./migrate.js";
import { getCompiledSchema } from "./schema/index.js";
import setup from "./setup.js";

const IP_RANGES_FETCH_ENABLED = process.env.SKIP_IP_RANGES === "false";

async function appStart() {
	try {
		await migrateFromSqliteToNewDb();
		await migrateUp();
		await setup();
		await getCompiledSchema();

		if (!IP_RANGES_FETCH_ENABLED) {
			logger.info("IP Ranges fetch is disabled by environment variable");
		} else {
			logger.info("IP Ranges fetch is enabled");
			internalIpRanges.initTimer();
			try {
				await internalIpRanges.fetch();
			} catch (err) {
				logger.error("IP Ranges fetch failed, continuing anyway:", err.message);
			}
		}

		internalCertificate.initTimer();
		maintenanceService.initTimer();
		await internalNginx.reload();
		cloudflaredService.init();
		internalTor.init();
		await oauth2ProxyService.init();
		dockerService.init();
		internalGitOps.init();
		ddnsService.initTimer();
		await internalChat.init();
		internalGitDeploy.init();

		const server = app.listen("/run/shieldpm.sock", () => {
			logger.info(`Backend PID ${process.pid} listening on unix socket...`);

			// Initialize Terminal WebSocket (needs server instance)
			internalTerminal.init(server);

			process.on("SIGTERM", () => {
				logger.info(`PID ${process.pid} received SIGTERM`);
				server.close(() => {
					logger.info("Stopping.");
					process.exit(0);
				});
			});
		});
	} catch (err) {
		logger.error(`Startup Error: ${err.message}`, err);
		setTimeout(appStart, 1000);
	}
}

try {
	appStart();
} catch (err) {
	logger.fatal(err);
	process.exit(1);
}
