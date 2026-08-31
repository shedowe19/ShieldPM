const settleHooks = async (hooks, logger, sweep) => {
	const results = await Promise.allSettled(
		hooks.map(async ({ name, stop }) => {
			await stop();
			logger.info(`Shutdown sweep ${sweep}: ${name} stopped`);
		}),
	);
	let failed = false;
	for (let index = 0; index < results.length; index += 1) {
		const result = results[index];
		if (result.status === "rejected") {
			failed = true;
			logger.error(`Shutdown sweep ${sweep}: ${hooks[index].name} failed`, result.reason);
		}
	}
	return failed;
};

const closeHttpServer = async (server, timeoutMs, logger) => {
	if (!server?.listening) return;
	await new Promise((resolve) => {
		let completed = false;
		const finish = () => {
			if (!completed) {
				completed = true;
				clearTimeout(timer);
				resolve(undefined);
			}
		};
		const timer = setTimeout(() => {
			logger.warn(`HTTP close phase exceeded ${timeoutMs}ms; closing remaining connections`);
			server.closeIdleConnections?.();
			server.closeAllConnections?.();
			finish();
		}, timeoutMs);
		server.close(finish);
		server.closeIdleConnections?.();
	});
};

/**
 * Install one idempotent process shutdown coordinator.
 *
 * @param {Object} options
 * @param {Array<{name: string, stop: () => Promise<void>|void}>} options.producerHooks
 * @param {() => Promise<void>} options.closeDatabase
 * @param {Object} options.logger
 * @param {number} [options.deadlineMs]
 * @param {number} [options.closePhaseMs]
 * @param {(code: number) => void} [options.exit]
 * @returns {{setServer: Function, setStartupPromise: Function, shutdown: Function, isShuttingDown: Function, dispose: Function}}
 */
export const installGracefulShutdown = ({
	producerHooks,
	closeDatabase,
	logger,
	deadlineMs = 15_000,
	closePhaseMs = 5_000,
	exit = (code) => process.exit(code),
}) => {
	let server = null;
	let startupPromise = Promise.resolve();
	let shutdownPromise = null;
	let shuttingDown = false;

	const shutdown = (signal = "manual") => {
		if (shutdownPromise) return shutdownPromise;
		shuttingDown = true;
		shutdownPromise = (async () => {
			logger.info(`PID ${process.pid} received ${signal}; graceful shutdown started`);
			const hardDeadline = setTimeout(() => {
				logger.fatal(`Graceful shutdown exceeded ${deadlineMs}ms; forcing exit`);
				exit(1);
			}, deadlineMs);
			hardDeadline.unref?.();

			let failed = false;
			try {
				// A signal can arrive while migrations/setup are still running. Let that attempt settle;
				// the global deadline remains authoritative if a dependency never returns.
				await startupPromise.catch((error) =>
					logger.warn("Startup settled with an error during shutdown", error),
				);
				await closeHttpServer(server, closePhaseMs, logger);
				failed = (await settleHooks(producerHooks, logger, 1)) || failed;
				// Hooks are required to be idempotent. A second sweep catches work scheduled at the edge
				// of the first one and makes shutdown behavior deterministic.
				failed = (await settleHooks(producerHooks, logger, 2)) || failed;
				try {
					await closeDatabase();
					logger.info("Database pool closed last");
				} catch (error) {
					failed = true;
					logger.error("Database close failed", error);
				}
			} finally {
				clearTimeout(hardDeadline);
			}
			exit(failed ? 1 : 0);
		})();
		return shutdownPromise;
	};

	const onSigterm = () => void shutdown("SIGTERM");
	const onSigint = () => void shutdown("SIGINT");
	process.once("SIGTERM", onSigterm);
	process.once("SIGINT", onSigint);

	return {
		setServer: (value) => {
			server = value;
		},
		setStartupPromise: (value) => {
			startupPromise = value;
		},
		shutdown,
		isShuttingDown: () => shuttingDown,
		dispose: () => {
			process.removeListener("SIGTERM", onSigterm);
			process.removeListener("SIGINT", onSigint);
		},
	};
};
