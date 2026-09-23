#!/usr/bin/env node

process.env.DATA_PATH ||= `${process.cwd()}/data`;
process.env.INITIAL_ADMIN_EMAIL ||= "admin@example.com";
process.env.INITIAL_ADMIN_PASSWORD ||= "changeme";
process.env.INITIAL_DEFAULT_PAGE ||= "congratulations";

// Imports initialize configuration and database connections, so the development
// environment must be established before evaluating any application module.
const [
	{ default: app },
	{ default: analyticsService },
	{ default: internalCertificate },
	{ default: internalIpRanges },
	{ default: internalNginx },
	{ default: internalProxyHostMonitor },
	{ default: utils },
	{ global: logger },
	{ migrateUp },
	{ getCompiledSchema },
	{ default: setup },
] = await Promise.all([
	import("./app.js"),
	import("./internal/analytics.js"),
	import("./internal/certificate.js"),
	import("./internal/ip_ranges.js"),
	import("./internal/nginx.js"),
	import("./internal/proxy-host-monitor.js"),
	import("./lib/utils.js"),
	import("./logger.js"),
	import("./migrate.js"),
	import("./schema/index.js"),
	import("./setup.js"),
]);

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
		const server = app.listen(port, "127.0.0.1", (err) => {
			if (err) {
				logger.error("Backend failed to listen:", err);
				process.exit(1);
				return;
			}
			logger.info(`Backend listening on port ${port}`);
			internalProxyHostMonitor.init();

			let shuttingDown = false;
			const shutdown = () => {
				if (shuttingDown) return;
				shuttingDown = true;
				process.removeListener("SIGINT", shutdown);
				process.removeListener("SIGTERM", shutdown);
				internalProxyHostMonitor.stop();
				server.close(async () => {
					await analyticsService.stop();
					process.exit(0);
				});
			};
			process.on("SIGINT", shutdown);
			process.on("SIGTERM", shutdown);
		});
	} catch (err) {
		logger.error("Startup Error", err);
		process.exit(1);
	}
}

start();
