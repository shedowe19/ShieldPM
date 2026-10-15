import { spawn } from "node:child_process";
import dgram from "node:dgram";
import { once } from "node:events";
import net from "node:net";
import { describe, expect, it } from "vitest";
import {
	remapSmokeListeners,
	SmokePortCollisionError,
	SmokePortReservations,
	startSmokeNginx,
	stopSmokeNginx,
	withSmokeEndpointRetries,
} from "../../../scripts/ci/nginx-smoke-endpoints.mjs";

const listen = async (server, port) => {
	const listening = once(server, "listening");
	if (server instanceof net.Server) server.listen(port, "127.0.0.1");
	else server.bind(port, "127.0.0.1");
	await listening;
};
const close = (server) => new Promise((resolve) => server.close(resolve));

describe("isolated Nginx smoke endpoints", () => {
	it("identifies retryable listener collisions without losing Error behavior", () => {
		const error = new SmokePortCollisionError("occupied");
		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(SmokePortCollisionError);
		expect(error.name).toBe("SmokePortCollisionError");
		expect(error.message).toBe("occupied");
		expect(error.stack).toContain("SmokePortCollisionError: occupied");
	});

	it("holds distinct TCP and UDP listeners throughout configuration generation", async () => {
		const reservations = new SmokePortReservations();
		try {
			const ports = await Promise.all(Array.from({ length: 24 }, () => reservations.reserve()));
			expect(new Set(ports).size).toBe(24);
			const udpPort = await reservations.reserve("udp");
			const tcp = net.createServer();
			const udp = dgram.createSocket("udp4");
			await expect(listen(tcp, ports[0])).rejects.toMatchObject({ code: "EADDRINUSE" });
			await expect(listen(udp, udpPort)).rejects.toMatchObject({ code: "EADDRINUSE" });
			udp.close();
			const accidental = net.connect(ports[0], "127.0.0.1");
			accidental.on("error", () => {});
			await new Promise((resolve) => accidental.once("close", resolve));
			await reservations.release();
			await listen(tcp, ports[0]);
			await close(tcp);
		} finally {
			await reservations.release();
		}
	});

	it("recovers a real post-release collision with a fresh listener and functioning endpoint", async () => {
		const reservations = new SmokePortReservations();
		let targetPort = await reservations.reserve();
		const firstPort = targetPort;
		let blocker;
		let echo;
		let attempts = 0;
		try {
			await withSmokeEndpointRetries({
				reservations,
				remap: async (replacements) => {
					targetPort = replacements.get(`tcp:${targetPort}`);
				},
				run: async () => {
					attempts++;
					if (attempts === 1) {
						blocker = net.createServer();
						await listen(blocker, targetPort);
					}
					echo = net.createServer((connection) => connection.end("fresh endpoint"));
					try {
						await listen(echo, targetPort);
					} catch (error) {
						if (error.code !== "EADDRINUSE") throw error;
						throw new SmokePortCollisionError("actual bind collision");
					}
				},
			});
			expect(attempts).toBe(2);
			expect(targetPort).not.toBe(firstPort);
			const client = net.connect(targetPort, "127.0.0.1");
			const [body] = await once(client, "data");
			expect(body.toString()).toBe("fresh endpoint");
			client.destroy();
		} finally {
			if (echo?.listening) await close(echo);
			if (blocker?.listening) await close(blocker);
			await reservations.release();
		}
	});

	it("remaps TCP and UDP listens without changing upstreams or unrelated ports", () => {
		const configuration =
			"listen 127.0.0.1:40123 http2; listen 127.0.0.1:40123 udp reuseport; " +
			"proxy_pass http://127.0.0.1:40123; listen 127.0.0.1:40124; listen unix:/tmp/smoke.sock;";
		expect(
			remapSmokeListeners(
				configuration,
				new Map([
					["tcp:40123", 40201],
					["udp:40123", 40202],
				]),
			),
		).toBe(
			configuration
				.replace("127.0.0.1:40123 http2", "127.0.0.1:40201 http2")
				.replace("127.0.0.1:40123 udp", "127.0.0.1:40202 udp"),
		);
	});

	it("does not retry genuine configuration errors and bounds persistent collisions", async () => {
		for (const [error, expectedAttempts] of [
			[new Error("unknown directive"), 1],
			[new SmokePortCollisionError("occupied"), 3],
		]) {
			const reservations = new SmokePortReservations();
			let attempts = 0;
			await expect(
				withSmokeEndpointRetries({
					reservations,
					remap: async () => {},
					run: async () => {
						attempts++;
						throw error;
					},
				}),
			).rejects.toBe(error);
			expect(attempts).toBe(expectedAttempts);
		}
	});

	it("requires actual HTTP/2 readiness after delayed IPv4 startup", async () => {
		const reservations = new SmokePortReservations();
		const internalPort = await reservations.reserve();
		await reservations.release();
		let running;
		let fixture;
		let nginxArguments;
		try {
			running = await startSmokeNginx({
				nginxBin: "fixture",
				config: "unused",
				directory: "/tmp",
				internalPort,
				timeout: 2000,
				report: () => {},
				spawnProcess: (_command, arguments_, options) => {
					nginxArguments = arguments_;
					fixture = spawn(
						process.execPath,
						[
							"-e",
							`const server = require('node:http2').createServer();
							const startup = setTimeout(() => server.listen(${internalPort}, '127.0.0.1'), 100);
							process.once('SIGQUIT', () => {
								clearTimeout(startup);
								server.close(() => process.exit(0));
							});`,
						],
						options,
					);
					return fixture;
				},
			});
			expect(running.client.remoteSettings).toBeDefined();
			expect(nginxArguments.slice(0, 2)).toEqual(["-e", "stderr"]);
		} finally {
			if (running) await stopSmokeNginx(running);
			await reservations.release();
		}
		expect(fixture.exitCode).toBe(0);
		expect(fixture.signalCode).toBeNull();
	});

	it.each([
		{
			name: "classifies an exact bind diagnostic as a listener collision",
			program:
				"process.stderr.write('nginx: [emerg] bind() to 127.0.0.1:40123 failed (98: Address already in use)\\n'); setInterval(() => {}, 1000);",
			errorType: SmokePortCollisionError,
			message: "listener was claimed",
			timeout: 2000,
			exitCode: 0,
		},
		{
			name: "rejects a syntax error without retrying it as a collision",
			program: "process.stderr.write('nginx: [emerg] unknown directive\\n'); process.exit(1);",
			errorType: Error,
			message: "exited before readiness",
			timeout: 2000,
			exitCode: 1,
		},
		{
			name: "rejects an idle process that never serves HTTP/2",
			program: "setInterval(() => {}, 1000);",
			errorType: Error,
			message: "did not become ready",
			timeout: 300,
			exitCode: 0,
		},
	])(
		"$name",
		async ({ program, errorType, message, timeout, exitCode }) => {
			const reservations = new SmokePortReservations();
			const internalPort = await reservations.reserve();
			await reservations.release();
			let fixture;
			try {
				await expect(
					startSmokeNginx({
						nginxBin: "fixture",
						config: "unused",
						directory: "/tmp",
						internalPort,
						timeout,
						report: () => {},
						spawnProcess: (_command, _arguments, options) => {
							fixture = spawn(
								process.execPath,
								["-e", `process.once('SIGQUIT', () => process.exit(0)); ${program}`],
								options,
							);
							return fixture;
						},
					}),
				).rejects.toMatchObject({ constructor: errorType, message: expect.stringContaining(message) });
				expect(fixture.exitCode).toBe(exitCode);
				expect(fixture.signalCode).toBeNull();
			} finally {
				await reservations.release();
			}
		},
		// Each real child has its own bounded readiness and cleanup budget.
		10_000,
	);
});
