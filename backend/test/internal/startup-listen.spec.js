import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	port: 0,
	servers: [],
	completed: false,
	info: vi.fn(),
	error: vi.fn(),
	terminal: vi.fn(),
}));
vi.mock("../../app.js", async () => {
	const { default: express } = await import("express");
	const app = express().get("/", (_req, res) => res.json({ status: "OK" }));
	return {
		default: {
			listen: (_socket, ...args) => {
				const callback = args.at(-1);
				// Exercise Express's actual success/error callback contract over a local TCP socket.
				const server = app.listen(state.port, "127.0.0.1", (error) => {
					callback(error);
					state.completed = true;
				});
				state.servers.push(server);
				return server;
			},
		},
	};
});
vi.mock("../../internal/analytics.js", () => ({ default: { init: async () => {} } }));
vi.mock("../../internal/certificate.js", () => ({ default: { initTimer: async () => {} } }));
vi.mock("../../internal/chat.js", () => ({ default: { init: async () => {} } }));
vi.mock("../../internal/cloudflared.js", () => ({ default: { init: async () => {} } }));
vi.mock("../../internal/ddns.js", () => ({ default: { initTimer: () => {} } }));
vi.mock("../../internal/docker.js", () => ({ default: { init: async () => {} } }));
vi.mock("../../internal/git-deploy.js", () => ({ default: { init: async () => {} } }));
vi.mock("../../internal/gitops.js", () => ({ default: { init: async () => {} } }));
vi.mock("../../internal/ip_ranges.js", () => ({ default: {} }));
vi.mock("../../internal/maintenance.js", () => ({ default: { initTimer: () => {} } }));
vi.mock("../../internal/nginx.js", () => ({ default: { reload: async () => {} } }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: { init: async () => {} } }));
vi.mock("../../internal/terminal.js", () => ({ default: { init: state.terminal } }));
vi.mock("../../internal/tor.js", () => ({ default: { init: async () => {} } }));
vi.mock("../../internal/wireguard.js", () => ({ default: { init: async () => {} } }));
vi.mock("../../lib/db-migrate.js", () => ({ default: async () => {} }));
vi.mock("../../lib/utils.js", () => ({ default: { execFile: vi.fn() } }));
vi.mock("../../logger.js", () => ({ global: { info: state.info, error: state.error } }));
vi.mock("../../migrate.js", () => ({ migrateUp: async () => {} }));
vi.mock("../../schema/index.js", () => ({ getCompiledSchema: async () => {} }));
vi.mock("../../setup.js", () => ({ default: async () => {} }));

describe("backend listener lifecycle", () => {
	let listeners;
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		vi.stubEnv("SKIP_IP_RANGES", "true");
		for (const key of ["DATA_PATH", "INITIAL_ADMIN_EMAIL", "INITIAL_ADMIN_PASSWORD", "INITIAL_DEFAULT_PAGE"])
			vi.stubEnv(key, "");
		vi.spyOn(process, "exit").mockImplementation(() => undefined);
		state.port = 0;
		state.completed = false;
		listeners = new Map(
			["SIGTERM", "uncaughtException", "unhandledRejection"].map((event) => [event, process.listeners(event)]),
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
		expect(process.listeners("SIGTERM")).toEqual(listeners.get("SIGTERM"));
	});
	it("initializes the terminal only after listening and closes the server on SIGTERM", async () => {
		await import("../../index.js");
		await vi.waitFor(() => expect(state.completed).toBe(true));
		const server = state.servers[0];
		expect(state.terminal).toHaveBeenCalledExactlyOnceWith(server);
		expect(process.exit).not.toHaveBeenCalled();
		const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
		expect(await response.json()).toEqual({ status: "OK" });
		const handlers = process
			.listeners("SIGTERM")
			.filter((listener) => !listeners.get("SIGTERM").includes(listener));
		expect(handlers).toHaveLength(1);
		handlers[0]();
		await vi.waitFor(() => expect(process.exit).toHaveBeenCalledExactlyOnceWith(0));
		expect(server.listening).toBe(false);
	});
});
