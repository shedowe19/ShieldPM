import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db.js", () => ({ default: () => ({}) }));
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => false,
	isPostgres: () => false,
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../lib/host-domain-claims.js", () => ({ withHostDomainClaims: (_options, write) => write() }));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));

import docker from "../../internal/docker.js";
import { global as logger } from "../../logger.js";

describe("Docker event reconnection", () => {
	beforeEach(() => {
		docker.stop();
		docker.stopped = false;
		vi.useFakeTimers();
	});
	afterEach(() => {
		docker.stop();
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		vi.useRealTimers();
	});
	const setup = () => {
		const streams = [];
		const client = {
			isConnected: true,
			name: "test",
			docker: {
				ping: vi.fn().mockResolvedValue(),
				getEvents: vi.fn((_options, callback) => {
					const stream = new PassThrough();
					streams.push(stream);
					callback(null, stream);
				}),
			},
		};
		docker.clients = [client];
		const index = vi.spyOn(docker, "createHostIndex").mockResolvedValue({});
		const reconcile = vi.spyOn(docker, "syncClient").mockResolvedValue();
		return { streams, client, index, reconcile };
	};
	const unavailableSocket = async (hosts = "", code = "ENOENT") => {
		vi.stubEnv("DOCKER_HOSTS", hosts);
		const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
		const info = vi.spyOn(logger, "info").mockImplementation(() => {});
		const addClient = docker.addClient.bind(docker);
		const streams = [];
		vi.spyOn(docker, "addClient").mockImplementation((...args) => {
			addClient(...args);
			const client = docker.clients.at(-1);
			client.docker.ping = vi.fn().mockRejectedValue(Object.assign(new Error("socket unavailable"), { code }));
			client.docker.getEvents = vi.fn((_options, callback) => {
				const stream = new PassThrough();
				streams.push(stream);
				callback(null, stream);
			});
		});
		vi.spyOn(docker, "createHostIndex").mockResolvedValue({});
		const reconcile = vi.spyOn(docker, "syncClient").mockResolvedValue();
		await docker.init();
		return { client: docker.clients[0], warn, info, streams, reconcile };
	};
	it("treats an absent implicit local socket as optional and retries once per bounded backoff", async () => {
		const { client, warn, info } = await unavailableSocket();
		expect(warn).not.toHaveBeenCalled();
		expect(info).toHaveBeenCalledExactlyOnceWith(
			"Docker Auto-Discovery [Local Socket]: Optional local socket is unavailable; discovery will retry automatically.",
		);
		for (const [attempt, delay] of [30000, 60000, 120000, 240000, 300000, 300000].entries()) {
			await vi.advanceTimersByTimeAsync(delay - 1);
			expect(client.docker.ping).toHaveBeenCalledTimes(attempt + 1);
			await vi.advanceTimersByTimeAsync(1);
			expect(client.docker.ping).toHaveBeenCalledTimes(attempt + 2);
			expect(vi.getTimerCount()).toBe(1);
		}
		expect(warn).not.toHaveBeenCalled();
		expect(info).toHaveBeenCalledOnce();
	});
	it.each(["/var/run/docker.sock", "/run/custom/docker.sock", "tcp://192.0.2.10:2375"])(
		"keeps failures visible for the configured Docker endpoint %s",
		async (hosts) => {
			const { warn } = await unavailableSocket(hosts);
			expect(warn).toHaveBeenCalledOnce();
			expect(warn.mock.calls[0][0]).toContain("Could not connect");
			await vi.advanceTimersByTimeAsync(31000);
			expect(warn).toHaveBeenCalledOnce();
			await vi.advanceTimersByTimeAsync(300000);
			expect(warn).toHaveBeenCalledTimes(2);
		},
	);
	it.each(["EACCES", "ECONNREFUSED"])("warns on %s even for the optional local socket", async (code) => {
		const { warn } = await unavailableSocket("", code);
		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0][0]).toContain("Could not connect");
	});
	it("does not confuse a custom socket path containing the default path with the default socket", async () => {
		const { warn, info } = await unavailableSocket("/tmp/var/run/docker.sock,/tmp/var/run/docker.sock");
		expect(docker.clients).toHaveLength(2);
		expect(warn).toHaveBeenCalledExactlyOnceWith(
			"Docker Auto-Discovery [Socket /tmp/var/run/docker.sock]: Could not connect: socket unavailable",
		);
		expect(info).toHaveBeenCalledOnce();
	});
	it("recovers when the optional socket appears and clears its backoff and failure notice", async () => {
		const { client, streams, info, reconcile } = await unavailableSocket();
		await vi.advanceTimersByTimeAsync(90000);
		client.docker.ping.mockResolvedValue();
		await vi.advanceTimersByTimeAsync(120000);
		expect(reconcile).toHaveBeenCalledOnce();
		expect(client.docker.getEvents).toHaveBeenCalledOnce();
		expect(client.isConnected).toBe(true);
		streams[0].emit("end");
		client.docker.ping.mockRejectedValue(Object.assign(new Error("socket unavailable"), { code: "ENOENT" }));
		await vi.advanceTimersByTimeAsync(1000);
		expect(client.docker.ping).toHaveBeenCalledTimes(5);
		expect(info.mock.calls.filter(([message]) => message.includes("Optional local socket"))).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(29999);
		expect(client.docker.ping).toHaveBeenCalledTimes(5);
		await vi.advanceTimersByTimeAsync(1);
		expect(client.docker.ping).toHaveBeenCalledTimes(6);
	});
	it("does not silence a synchronization ENOENT after a successful local socket ping", async () => {
		const { client, warn, reconcile } = await unavailableSocket();
		client.docker.ping.mockResolvedValue();
		reconcile.mockRejectedValue(Object.assign(new Error("socket unavailable"), { code: "ENOENT" }));
		await vi.advanceTimersByTimeAsync(30000);
		expect(warn).toHaveBeenCalledExactlyOnceWith(
			"Docker Auto-Discovery [Local Socket]: Reconnect failed: socket unavailable",
		);
		await vi.advanceTimersByTimeAsync(999);
		expect(client.docker.ping).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(1);
		expect(client.docker.ping).toHaveBeenCalledTimes(3);
	});
	it("does not start a second reconnect while its ping is still pending", async () => {
		const { client } = setup();
		const pendingPing = Promise.withResolvers();
		client.docker.ping.mockReturnValue(pendingPing.promise);
		docker.scheduleReconnect(client);
		await vi.advanceTimersByTimeAsync(1000);
		docker.scheduleReconnect(client);
		await vi.advanceTimersByTimeAsync(60000);
		expect(client.docker.ping).toHaveBeenCalledOnce();
		pendingPing.resolve();
		await vi.advanceTimersByTimeAsync(0);
		expect(client.docker.getEvents).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});
	it("logs changed failures immediately and clears warning suppression after connection recovery", async () => {
		const { client, streams } = setup();
		const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
		vi.spyOn(logger, "info").mockImplementation(() => {});
		await docker.watch();
		streams[0].emit("end");
		client.docker.ping.mockRejectedValue(Object.assign(new Error("permission denied"), { code: "EACCES" }));
		await vi.advanceTimersByTimeAsync(1000);
		expect(warn).toHaveBeenCalledOnce();
		client.docker.ping.mockRejectedValue(Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" }));
		await vi.advanceTimersByTimeAsync(2000);
		expect(warn).toHaveBeenCalledTimes(2);
		client.docker.ping.mockResolvedValue();
		await vi.advanceTimersByTimeAsync(4000);
		streams[1].emit("end");
		client.docker.ping.mockRejectedValue(Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" }));
		await vi.advanceTimersByTimeAsync(8000);
		expect(warn).toHaveBeenCalledTimes(3);
	});
	it("destroys an old stream when initialization replaces its client generation", async () => {
		const { streams, client } = setup();
		await docker.watch();
		docker.initialized = false;
		await unavailableSocket();
		expect(streams[0].destroyed).toBe(true);
		expect(client.watching).toBe(false);
		expect(client.stream).toBeNull();
		expect(vi.getTimerCount()).toBe(1);
	});
	it("ignores a failed reconnect ping after stop without logging or scheduling work", async () => {
		const { client } = setup();
		const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
		const pendingPing = Promise.withResolvers();
		client.docker.ping.mockReturnValue(pendingPing.promise);
		docker.scheduleReconnect(client);
		await vi.advanceTimersByTimeAsync(1000);
		docker.stop();
		pendingPing.reject(new Error("daemon stopped"));
		await vi.advanceTimersByTimeAsync(0);
		expect(warn).not.toHaveBeenCalled();
		expect(client.docker.getEvents).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});
	it("ignores an initialization ping completing after stop", async () => {
		vi.stubEnv("DOCKER_HOSTS", "");
		const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
		const pendingPing = Promise.withResolvers();
		vi.spyOn(docker, "addClient").mockImplementation(() => {
			docker.clients.push({ docker: { ping: () => pendingPing.promise }, name: "test" });
		});
		const initialized = docker.init();
		docker.stop();
		pendingPing.reject(new Error("daemon stopped"));
		await initialized;
		expect(warn).not.toHaveBeenCalled();
		expect(docker.initialized).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});
	it.each(["end", "close", "error"])("reconciles and reconnects exactly once after %s", async (event) => {
		const { streams, client, reconcile } = setup();
		await docker.watch();
		streams[0].emit(event, new Error("daemon restarted"));
		streams[0].emit("close");
		await vi.advanceTimersByTimeAsync(1001);
		expect(client.docker.ping).toHaveBeenCalledOnce();
		expect(reconcile).toHaveBeenCalledOnce();
		expect(client.docker.getEvents).toHaveBeenCalledTimes(2);
		await docker.watch();
		expect(client.docker.getEvents).toHaveBeenCalledTimes(2);
	});
	it("backs off failed reconnects and stop removes scheduled work and the active stream", async () => {
		const { streams, client } = setup();
		client.docker.ping.mockRejectedValue(new Error("offline"));
		await docker.watch();
		streams[0].emit("end");
		await vi.advanceTimersByTimeAsync(1001);
		expect(client.docker.ping).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1999);
		expect(client.docker.ping).toHaveBeenCalledTimes(2);
		docker.stop();
		await vi.advanceTimersByTimeAsync(60000);
		expect(client.docker.ping).toHaveBeenCalledTimes(2);
		expect(streams[0].destroyed).toBe(true);
	});
	it("backs off flapping streams and resets after a stable connection", async () => {
		const { streams, client } = setup();
		await docker.watch();
		streams[0].emit("end");
		await vi.advanceTimersByTimeAsync(1000);
		streams[1].emit("close");
		await vi.advanceTimersByTimeAsync(1000);
		expect(client.docker.getEvents).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(1000);
		expect(client.docker.getEvents).toHaveBeenCalledTimes(3);
		await vi.advanceTimersByTimeAsync(30000);
		streams[2].emit("end");
		await vi.advanceTimersByTimeAsync(1000);
		expect(client.docker.getEvents).toHaveBeenCalledTimes(4);
	});
	it("cannot reopen a stream after stop during a delayed reconnect", async () => {
		const { streams, client } = setup();
		const ping = Promise.withResolvers();
		client.docker.ping.mockReturnValue(ping.promise);
		await docker.watch();
		streams[0].emit("end");
		await vi.advanceTimersByTimeAsync(1001);
		docker.stop();
		ping.resolve();
		await vi.advanceTimersByTimeAsync(60000);
		expect(client.docker.getEvents).toHaveBeenCalledOnce();
	});
});
