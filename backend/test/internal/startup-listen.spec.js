import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	analyticsStop: vi.fn(async () => {}),
	analyticsInit: vi.fn(async () => {}),
	migrate: vi.fn(async () => {}),
	port: 0,
	servers: [],
	completed: false,
	info: vi.fn(),
	error: vi.fn(),
	terminal: vi.fn(),
	monitorStart: vi.fn(),
	monitorStop: vi.fn(),
	firewallStart: vi.fn(),
	firewallStop: vi.fn(async () => {}),
	configurationLock: vi.fn(),
	reload: vi.fn(async () => {}),
	backupCommit: vi.fn(async () => {}),
	incidentStart: vi.fn(),
	incidentStop: vi.fn(),
	trafficStart: vi.fn(),
	trafficStop: vi.fn(),
	cleanupStart: vi.fn(),
	cleanupStop: vi.fn(),
	bridgePrepare: vi.fn(async () => {}),
	bridgeStop: vi.fn(async () => {}),
}));
vi.mock("../../app.js", async () => {
	const { default: express } = await import("express");
	const app = express().get("/", (_req, res) => res.json({ status: "OK" }));
	return {
		default: {
			listen: (_socket, ...args) => {
				const callback = args.at(-1);
				// Exercise Express's actual success/error callback contract over a local TCP socket.
				const server = app.listen(state.port, "127.0.0.1", async (error) => {
					await callback(error);
					state.completed = true;
				});
				state.servers.push(server);
				return server;
			},
		},
	};
});
vi.mock("../../internal/instance-backups.js", () => ({ default: { commitStartupRestore: state.backupCommit } }));
vi.mock("../../internal/incidents.js", () => ({ default: { init: state.incidentStart, stop: state.incidentStop } }));
vi.mock("../../internal/host-traffic-policy.js", () => ({
	default: { init: state.trafficStart, stop: state.trafficStop },
}));
vi.mock("../../internal/auth-session-cleanup.js", () => ({
	default: { initTimer: state.cleanupStart, stop: state.cleanupStop },
}));
vi.mock("../../internal/analytics.js", () => ({ default: { init: state.analyticsInit, stop: state.analyticsStop } }));
vi.mock("../../internal/certificate.js", () => ({ default: { initTimer: async () => {} } }));
vi.mock("../../internal/chat.js", () => ({ default: { init: async () => {} } }));
vi.mock("../../internal/cloudflared.js", () => ({ default: { init: async () => {} } }));
vi.mock("../../internal/ddns.js", () => ({ default: { initTimer: () => {} } }));
vi.mock("../../internal/docker.js", () => ({ default: { init: async () => {}, stop: async () => {} } }));
vi.mock("../../internal/firewall-list.js", () => ({
	default: { initTimer: state.firewallStart, stopTimer: state.firewallStop },
}));
vi.mock("../../internal/git-deploy.js", () => ({ default: { init: async () => {} } }));
vi.mock("../../internal/gitops.js", () => ({ default: { init: async () => {} } }));
vi.mock("../../internal/ip_ranges.js", () => ({ default: {} }));
vi.mock("../../internal/maintenance.js", () => ({ default: { initTimer: () => {} } }));
vi.mock("../../internal/nginx.js", () => ({
	default: { reload: state.reload, withConfigurationLock: state.configurationLock },
}));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: { init: async () => {} } }));
vi.mock("../../internal/proxy-host-monitor.js", () => ({
	default: { init: state.monitorStart, stop: state.monitorStop },
}));
vi.mock("../../internal/terminal.js", () => ({ default: { init: state.terminal } }));
vi.mock("../../internal/tor.js", () => ({ default: { init: async () => {} } }));
vi.mock("../../internal/wireguard.js", () => ({ default: { init: async () => {} } }));
vi.mock("../../internal/upload-relay.js", () => ({ default: { init: vi.fn(), stop: vi.fn(async () => {}) } }));
vi.mock("../../internal/wasi-host-bridge.js", () => ({
	prepareWasiHostBridge: state.bridgePrepare,
	stopWasiHostBridges: state.bridgeStop,
}));
vi.mock("../../lib/db-migrate.js", () => ({ default: async () => {} }));
vi.mock("../../lib/utils.js", () => ({ default: { execFile: vi.fn() } }));
vi.mock("../../logger.js", () => ({ global: { info: state.info, error: state.error } }));
vi.mock("../../migrate.js", () => ({ migrateUp: state.migrate }));
vi.mock("../../schema/index.js", () => ({ getCompiledSchema: async () => {} }));
vi.mock("../../setup.js", () => ({ default: async () => {} }));

describe("backend listener lifecycle", () => {
	let listeners;
	beforeEach(async () => {
		vi.resetModules();
		vi.clearAllMocks();
		state.firewallStop.mockResolvedValue(undefined);
		state.analyticsStop.mockResolvedValue(undefined);
		state.analyticsInit.mockResolvedValue(undefined);
		state.backupCommit.mockResolvedValue(undefined);
		state.migrate.mockResolvedValue(undefined);
		state.configurationLock.mockImplementation(async (callback) => callback());
		state.bridgePrepare.mockResolvedValue(undefined);
		state.bridgeStop.mockResolvedValue(undefined);
		// index-dev intentionally replaces reload; restore the production fixture per case.
		(await import("../../internal/nginx.js")).default.reload = state.reload;
		vi.stubEnv("SKIP_IP_RANGES", "true");
		for (const key of ["DATA_PATH", "INITIAL_ADMIN_EMAIL", "INITIAL_ADMIN_PASSWORD", "INITIAL_DEFAULT_PAGE"])
			vi.stubEnv(key, "");
		vi.spyOn(process, "exit").mockImplementation(() => undefined);
		state.port = 0;
		state.completed = false;
		listeners = new Map(
			["SIGINT", "SIGTERM", "uncaughtException", "unhandledRejection"].map((event) => [
				event,
				process.listeners(event),
			]),
		);
	});
	afterEach(async () => {
		for (const server of state.servers.splice(0)) {
			server.closeAllConnections();
			await new Promise((resolve) => server.close(resolve));
		}
		for (const [event, existing] of listeners) {
			for (const listener of process.listeners(event)) {
				if (!existing.includes(listener)) process.removeListener(event, listener);
			}
		}
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});
	it.each(["production", "development"])(
		"waits for migrations, the WASI bridge and analytics initialization before listening in %s mode",
		async (mode) => {
			const migration = Promise.withResolvers();
			const initialization = Promise.withResolvers();
			const bridgeInitialization = Promise.withResolvers();
			state.migrate.mockReturnValueOnce(migration.promise);
			state.analyticsInit.mockReturnValueOnce(initialization.promise);
			state.bridgePrepare.mockReturnValueOnce(bridgeInitialization.promise);
			try {
				if (mode === "production") await import("../../index.js");
				else await import("../../index-dev.js");
				await vi.waitFor(() => expect(state.migrate).toHaveBeenCalledOnce());
				expect(state.analyticsInit).not.toHaveBeenCalled();
				expect(state.servers).toHaveLength(0);
				migration.resolve();
				await vi.waitFor(() => expect(state.bridgePrepare).toHaveBeenCalledOnce());
				expect(state.analyticsInit).not.toHaveBeenCalled();
				expect(state.servers).toHaveLength(0);
				bridgeInitialization.resolve();
				await vi.waitFor(() => expect(state.analyticsInit).toHaveBeenCalledOnce());
				expect(state.servers).toHaveLength(0);
				initialization.resolve();
				await vi.waitFor(() => expect(state.completed).toBe(true));
				expect(state.servers).toHaveLength(1);
			} finally {
				migration.resolve();
				bridgeInitialization.resolve();
				initialization.resolve();
				await vi.waitFor(() => expect(state.completed).toBe(true));
			}
		},
	);

	it.each(["production", "development"])(
		"waits for analytics draining and WASI bridge shutdown before process exit in %s mode",
		async (mode) => {
			const stopping = Promise.withResolvers();
			const bridgeStopping = Promise.withResolvers();
			state.analyticsStop.mockReturnValueOnce(stopping.promise);
			state.bridgeStop.mockReturnValueOnce(bridgeStopping.promise);
			try {
				if (mode === "production") await import("../../index.js");
				else await import("../../index-dev.js");
				await vi.waitFor(() => expect(state.completed).toBe(true));
				const handler = process
					.listeners("SIGTERM")
					.find((listener) => !listeners.get("SIGTERM").includes(listener));
				expect(handler).toBeTypeOf("function");
				handler();
				await vi.waitFor(() => expect(state.analyticsStop).toHaveBeenCalledOnce());
				expect(state.bridgeStop).not.toHaveBeenCalled();
				expect(process.exit).not.toHaveBeenCalled();
				stopping.resolve();
				await vi.waitFor(() => expect(state.bridgeStop).toHaveBeenCalledOnce());
				expect(process.exit).not.toHaveBeenCalled();
				bridgeStopping.resolve();
				await vi.waitFor(() => expect(process.exit).toHaveBeenCalledExactlyOnceWith(0));
			} finally {
				stopping.resolve();
				bridgeStopping.resolve();
			}
		},
	);

	it.each(["production", "development"])("exits on a real binding failure in %s mode", async (mode) => {
		const blocker = createServer();
		state.servers.push(blocker);
		blocker.listen(0, "127.0.0.1");
		await new Promise((resolve) => blocker.once("listening", resolve));
		state.port = blocker.address().port;
		if (mode === "production") await import("../../index.js");
		else await import("../../index-dev.js");
		await vi.waitFor(() => expect(state.completed).toBe(true));
		expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
		expect(state.error.mock.calls.flat()).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: "EADDRINUSE" })]),
		);
		expect(state.info.mock.calls.flat().join(" ")).not.toContain("listening");
		expect(state.terminal).not.toHaveBeenCalled();
		expect(state.incidentStart).not.toHaveBeenCalled();
		expect(state.trafficStart).not.toHaveBeenCalled();
		expect(state.monitorStart).not.toHaveBeenCalled();
		expect(state.monitorStop).not.toHaveBeenCalled();
		if (mode === "production") expect(state.firewallStart).toHaveBeenCalledOnce();
		else expect(state.firewallStart).not.toHaveBeenCalled();
		expect(state.firewallStop).not.toHaveBeenCalled();
		expect(process.listeners("SIGTERM")).toEqual(listeners.get("SIGTERM"));
		expect(process.listeners("SIGINT")).toEqual(listeners.get("SIGINT"));
	});
	it("initializes the terminal only after listening and closes the server on SIGTERM", async () => {
		await import("../../index.js");
		await vi.waitFor(() => expect(state.completed).toBe(true));
		const server = state.servers[0];
		expect(state.terminal).toHaveBeenCalledExactlyOnceWith(server);
		expect(state.monitorStart).toHaveBeenCalledOnce();
		expect(state.firewallStart).toHaveBeenCalledOnce();
		expect(process.exit).not.toHaveBeenCalled();
		const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
		expect(await response.json()).toEqual({ status: "OK" });
		const handlers = process
			.listeners("SIGTERM")
			.filter((listener) => !listeners.get("SIGTERM").includes(listener));
		expect(handlers).toHaveLength(1);
		let finishFirewall;
		state.firewallStop.mockReturnValue(
			new Promise((resolve) => {
				finishFirewall = resolve;
			}),
		);
		handlers[0]();
		await vi.waitFor(() => expect(state.firewallStop).toHaveBeenCalledTimes(2));
		expect(process.exit).not.toHaveBeenCalled();
		expect(state.analyticsStop).not.toHaveBeenCalled();
		finishFirewall();
		await vi.waitFor(() => expect(process.exit).toHaveBeenCalledExactlyOnceWith(0));
		expect(state.analyticsStop).toHaveBeenCalledOnce();
		expect(state.monitorStop).toHaveBeenCalledOnce();
		expect(server.listening).toBe(false);
	});

	it("waits for the configuration queue before reloading or accepting requests at startup", async () => {
		let release;
		state.configurationLock.mockImplementation(
			(callback) =>
				new Promise((resolve, reject) => {
					release = () => Promise.resolve().then(callback).then(resolve, reject);
				}),
		);
		await import("../../index.js");
		await vi.waitFor(() => expect(state.configurationLock).toHaveBeenCalledOnce());
		expect(state.reload).not.toHaveBeenCalled();
		expect(state.servers).toHaveLength(0);
		await release();
		await vi.waitFor(() => expect(state.completed).toBe(true));
		expect(state.reload).toHaveBeenCalledOnce();
	});
	it.each(["SIGINT", "SIGTERM"])("runs development monitoring after listen and stops it on %s", async (signal) => {
		await import("../../index-dev.js");
		await vi.waitFor(() => expect(state.completed).toBe(true));
		const server = state.servers[0];
		expect(state.monitorStart).toHaveBeenCalledOnce();
		const handlers = process.listeners(signal).filter((listener) => !listeners.get(signal).includes(listener));
		expect(handlers).toHaveLength(1);
		handlers[0]();
		await vi.waitFor(() => expect(process.exit).toHaveBeenCalledExactlyOnceWith(0));
		expect(state.monitorStop).toHaveBeenCalledOnce();
		expect(state.analyticsStop).toHaveBeenCalledOnce();
		expect(server.listening).toBe(false);
		expect(process.listeners("SIGINT")).toEqual(listeners.get("SIGINT"));
		expect(process.listeners("SIGTERM")).toEqual(listeners.get("SIGTERM"));
	});
	it("commits a staged restore only after initialization and a successful socket bind", async () => {
		const commit = Promise.withResolvers();
		state.backupCommit.mockReturnValueOnce(commit.promise);
		await import("../../index.js");
		await vi.waitFor(() => expect(state.backupCommit).toHaveBeenCalledOnce());
		expect(state.servers[0].listening).toBe(true);
		expect(state.migrate).toHaveBeenCalledOnce();
		expect(state.analyticsInit).toHaveBeenCalledOnce();
		expect(state.completed).toBe(false);
		expect(state.incidentStart).not.toHaveBeenCalled();
		commit.resolve();
		await vi.waitFor(() => expect(state.completed).toBe(true));
	});
	it("closes the listener and exits if the staged restore cannot be committed", async () => {
		state.backupCommit.mockRejectedValueOnce(new Error("checkpoint unavailable"));
		await import("../../index.js");
		await vi.waitFor(() => expect(process.exit).toHaveBeenCalledExactlyOnceWith(1));
		expect(state.servers[0].listening).toBe(false);
	});
});
