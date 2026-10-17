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

describe("Docker event reconnection", () => {
	beforeEach(() => {
		docker.stop();
		docker.stopped = false;
		vi.useFakeTimers();
	});
	afterEach(() => {
		docker.stop();
		vi.restoreAllMocks();
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
