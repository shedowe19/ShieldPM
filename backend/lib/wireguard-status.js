import * as childProcess from "node:child_process";
import errs from "./error.js";

const SNAPSHOT_TTL_MS = 2000;
let generation = 0;
let cached;
let pending;

/**
 * Run bounded CLI observations without blocking Node's event loop or invoking a shell.
 * @param {string} binary
 * @param {string[]} args
 * @returns {Promise<string>}
 */
export const wireguardCommand = (binary, args) =>
	new Promise((resolve, reject) => {
		childProcess.execFile(
			binary,
			args,
			{ encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024 },
			(error, stdout) => {
				if (error) reject(new errs.InternalError("WireGuard command failed", error));
				else resolve(stdout.trim());
			},
		);
	});

export const probeWireguardAvailable = async () => {
	try {
		await wireguardCommand("wg", ["--version"]);
		return true;
	} catch {
		return false;
	}
};
export const probeWireguardInterface = async () => {
	try {
		await wireguardCommand("ip", ["link", "show", "wg0"]);
		return true;
	} catch {
		return false;
	}
};

export const invalidateWireguardSnapshot = () => {
	generation++;
	cached = undefined;
};

const observe = async () => {
	const available = await probeWireguardAvailable();
	const interfaceUp = available && (await probeWireguardInterface());
	const statuses = new Map();
	if (interfaceUp) {
		try {
			const output = await wireguardCommand("wg", ["show", "wg0", "dump"]);
			// The interface header contains a private key: discard it immediately.
			for (const line of output.split("\n").slice(1)) {
				const parts = line.split("\t");
				if (parts.length >= 7)
					statuses.set(parts[0], {
						lastHandshake: Number.parseInt(parts[4], 10) || 0,
						transferRx: Number.parseInt(parts[5], 10) || 0,
						transferTx: Number.parseInt(parts[6], 10) || 0,
					});
			}
		} catch {
			// A down/reconfiguring interface must not replace stored counters with zero.
		}
	}
	return { available, interfaceUp, statuses };
};

/** One in-flight observation and a short immutable-by-convention snapshot, shared across owners. */
export const readWireguardSnapshot = async () => {
	if (cached && cached.generation === generation && cached.expires > Date.now()) return cached.snapshot;
	if (!pending) {
		const observedGeneration = generation;
		const work = observe()
			.then((snapshot) => {
				if (observedGeneration === generation)
					cached = { generation, expires: Date.now() + SNAPSHOT_TTL_MS, snapshot };
				return { generation: observedGeneration, snapshot };
			})
			.finally(() => {
				if (pending === work) pending = undefined;
			});
		pending = work;
	}
	const result = await pending;
	// A delayed observation from before a mutation cannot repopulate its cache.
	return result.generation === generation ? result.snapshot : readWireguardSnapshot();
};
