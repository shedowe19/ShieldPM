#!/usr/bin/env node

import "./lib/load-env-secrets.js";

process.on("unhandledRejection", (reason, promise) => {
	logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
	logger.error("Uncaught Exception:", err);
	process.exit(1);
});

import app from "./app.js";
import { destroyDatabase } from "./db.js";
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
import { installGracefulShutdown } from "./lib/graceful-shutdown.js";
import { global as logger } from "./logger.js";
import { migrateUp } from "./migrate.js";
import { getCompiledSchema } from "./schema/index.js";
import setup from "./setup.js";

const IP_RANGES_FETCH_ENABLED = process.env.SKIP_IP_RANGES === "false";

const shutdownCoordinator = installGracefulShutdown({
	logger,
	producerHooks: [
		{ name: "analytics", stop: () => analyticsService.stop?.() },
		{ name: "certificate renewals", stop: () => internalCertificate.stopTimer() },
		{ name: "DDNS", stop: () => internalDdns.stop() },
		{ name: "IP range refresh", stop: () => internalIpRanges.stopTimer() },
		{ name: "maintenance scheduling", stop: () => internalMaintenance.stopTimer() },
		{ name: "Docker discovery", stop: () => internalDocker.stop() },
		{ name: "Git deploy polling", stop: () => internalGitDeploy.stopAllPolling() },
		{
			name: "GitOps auto-push scheduling",
			stop: () => {
				if (internalGitOps._autoPushTimer) clearTimeout(internalGitOps._autoPushTimer);
				internalGitOps._autoPushTimer = null;
			},
		},
		{ name: "ChatOps", stop: () => internalChat.stopAll() },
		{ name: "terminal sockets", stop: () => internalTerminal.stopAll() },
		{ name: "Cloudflared children", stop: () => internalCloudflared.stopAll() },
		{ name: "OAuth2 Proxy children", stop: () => internalOAuth2Proxy.stopAll() },
	],
	closeDatabase: destroyDatabase,
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const listen = () =>
	new Promise((resolve, reject) => {
		const server = app.listen("/run/shieldpm.sock", () => resolve(server));
		server.once("error", reject);
	});

async function appStart() {
	while (!shutdownCoordinator.isShuttingDown()) {
		try {
			await migrateFromSqliteToNewDb();
			await migrateUp();
			const analyticsInitialized = await analyticsService.init();
			if (!analyticsInitialized) throw new Error("Analytics durable spool initialization failed");
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
			await internalCloudflared.init();
			await internalTor.init();
			await internalWireguard.init();
			await internalOAuth2Proxy.init();
			await internalDocker.init();
			await internalGitOps.init();
			internalDdns.initTimer();
			await internalChat.init();
			await internalGitDeploy.init();

			if (shutdownCoordinator.isShuttingDown()) return;
			const server = await listen();
			shutdownCoordinator.setServer(server);
			logger.info(`Backend PID ${process.pid} listening on unix socket...`);

			internalTerminal.init(server);
			return;
		} catch (err) {
			logger.error(`Startup Error: ${err.message}`, err);
			if (!shutdownCoordinator.isShuttingDown()) await delay(1000);
		}
	}
}

try {
	const startupPromise = appStart();
	shutdownCoordinator.setStartupPromise(startupPromise);
	await startupPromise;
} catch (err) {
	logger.fatal(err);
	process.exit(1);
}
