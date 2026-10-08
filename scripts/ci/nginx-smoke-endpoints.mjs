import { spawn } from "node:child_process";
import dgram from "node:dgram";
import { once } from "node:events";
import http2 from "node:http2";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

export class SmokePortCollisionError extends Error {}

/** Keep every listener reserved until the generated configuration is ready. */
export class SmokePortReservations {
	entries = [];

	async reserve(protocol = "tcp") {
		if (protocol !== "tcp" && protocol !== "udp")
			throw new Error("Unsupported smoke protocol");
		const socket =
			protocol === "tcp"
				? net.createServer((connection) => connection.destroy())
				: dgram.createSocket("udp4");
		const listening = once(socket, "listening");
		if (protocol === "tcp") socket.listen(0, "127.0.0.1");
		else socket.bind(0, "127.0.0.1");
		await listening;
		const port = socket.address().port;
		this.entries.push({ protocol, port, socket });
		return port;
	}

	async release() {
		await Promise.all(
			this.entries.map(async (entry) => {
				if (!entry.socket) return;
				await new Promise((resolve) => entry.socket.close(resolve));
				entry.socket = null;
			}),
		);
	}

	async renew() {
		await this.release();
		const previous = this.entries;
		this.entries = [];
		const replacements = new Map();
		for (const entry of previous) {
			replacements.set(
				`${entry.protocol}:${entry.port}`,
				await this.reserve(entry.protocol),
			);
		}
		return replacements;
	}
}

/** Change only the smoke's IPv4 listen endpoints, preserving every upstream. */
export function remapSmokeListeners(configuration, replacements) {
	return configuration.replace(
		/\blisten\s+127\.0\.0\.1:(\d+)([^;]*);/g,
		(directive, port, options) => {
			const protocol = /\budp\b/.test(options) ? "udp" : "tcp";
			const next = replacements.get(`${protocol}:${port}`);
			return next ? directive.replace(`:${port}`, `:${next}`) : directive;
		},
	);
}

/** Retry genuine bind collisions; syntax, readiness and request failures remain fatal. */
export async function withSmokeEndpointRetries({
	reservations,
	remap,
	run,
	attempts = 3,
}) {
	for (let attempt = 1; attempt <= attempts; attempt++) {
		await reservations.release();
		try {
			return await run();
		} catch (error) {
			if (!(error instanceof SmokePortCollisionError) || attempt === attempts)
				throw error;
			await remap(await reservations.renew());
		}
	}
}

export async function stopSmokeNginx({ nginx, exited, client, spawnError }) {
	client?.destroy();
	if (
		nginx &&
		nginx.exitCode === null &&
		nginx.signalCode === null &&
		!spawnError
	) {
		nginx.kill("SIGQUIT");
		await Promise.race([exited, delay(3000)]);
		if (nginx.exitCode === null && nginx.signalCode === null) {
			nginx.kill("SIGKILL");
			await exited;
		}
	}
}

/** Require an HTTP/2 settings exchange, rather than just a kernel TCP handshake. */
export async function startSmokeNginx({
	nginxBin,
	config,
	directory,
	socket,
	internalPort,
	spawnProcess = spawn,
	report = (chunk) => process.stderr.write(chunk),
	timeout = 5000,
}) {
	const nginx = spawnProcess(
		nginxBin,
		["-e", "stderr", "-c", config, "-p", `${directory}/`, "-g", "daemon off;"],
		{ stdio: ["ignore", "inherit", "pipe"] },
	);
	const exited = once(nginx, "exit").catch(() => {});
	let client;
	let spawnError;
	let startupError;
	let stderr = "";
	let rejectStartup;
	const failed = new Promise((_, reject) => {
		rejectStartup = reject;
	});
	const fail = (error) => {
		startupError ||= error;
		rejectStartup(startupError);
	};
	nginx.on("error", (error) => {
		spawnError = error;
		fail(error);
	});
	nginx.on("exit", (code, signal) =>
		fail(
			new Error(`Isolated Nginx exited before readiness (${code ?? signal})`),
		),
	);
	nginx.stderr.on("data", (chunk) => {
		report(chunk);
		stderr = (stderr + chunk.toString()).slice(-65536);
		if (
			/bind\(\) to 127\.0\.0\.1:\d+ failed \(98: Address already in use\)/.test(
				stderr,
			)
		) {
			fail(
				new SmokePortCollisionError(
					"Isolated Nginx IPv4 listener was claimed before startup",
				),
			);
		}
	});
	const timer = setTimeout(
		() =>
			fail(new Error("Isolated Nginx HTTP/2 endpoint did not become ready")),
		timeout,
	);
	try {
		while (true) {
			client = http2.connect("http://localhost", {
				createConnection: () =>
					internalPort
						? net.connect(internalPort, "127.0.0.1")
						: net.connect(socket),
			});
			client.on("error", () => {});
			try {
				await Promise.race([once(client, "remoteSettings"), failed]);
				if (startupError) throw startupError;
				return { nginx, exited, client };
			} catch (error) {
				client.destroy();
				if (startupError) throw startupError;
				if (!new Set(["ECONNREFUSED", "ENOENT"]).has(error.code)) throw error;
				await Promise.race([delay(25), failed]);
			}
		}
	} catch (error) {
		await stopSmokeNginx({ nginx, exited, client, spawnError });
		throw error;
	} finally {
		clearTimeout(timer);
	}
}
