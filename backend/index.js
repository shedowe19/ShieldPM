#!/usr/bin/env node

process.on("unhandledRejection", (reason, promise) => {
	logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
	logger.error("Uncaught Exception:", err);
	process.exit(1);
});

import app from "./app.js";
import analyticsService from "./internal/analytics.js";
import internalCertificate from "./internal/certificate.js";
import internalChat from "./internal/chat.js";
import internalCloudflared from "./internal/cloudflared.js";
import internalDdns from "./internal/ddns.js";
import internalDocker from "./internal/docker.js";
import internalGitDeploy from "./internal/git-deploy.js";
import internalGitOps from "./internal/gitops.js";
import internalIpRanges from "./internal/ip_ranges.js";
import internalMaintenance from "./internal/maintenance.js";
import internalNginx from "./internal/nginx.js";
import internalOAuth2Proxy from "./internal/oauth2-proxy.js";
import internalTerminal from "./internal/terminal.js";
import internalTor from "./internal/tor.js";
import internalWireguard from "./internal/wireguard.js";
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
		await analyticsService.init();
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

		await internalCertificate.initTimer();
		internalMaintenance.initTimer();
		await internalNginx.reload();
		internalCloudflared.init();
		internalTor.init();
		internalWireguard.init();
		await internalOAuth2Proxy.init();
		internalDocker.init();
		internalGitOps.init();
		internalDdns.initTimer();
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
