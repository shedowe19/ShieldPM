/** Private Nginx-to-WASI command bridge; intentionally absent from the public Express application. */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import errs from "../lib/error.js";
import {
	MAX_WASI_HTTP_PACKET_BYTES,
	normalizeWasiHttpRequest,
	parseWasiHttpResult,
} from "../lib/wasi-http-contract.js";
import { runWasiHttpApplication } from "../lib/wasi-runner.js";
import { moduleIdentifier, readWasmFile, wasmDirectory, writeWasmArtifact } from "./wasm-modules.js";

const bridges = new Map();
const root = () => path.resolve(process.env.DATA_PATH || "/data", "wasm");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const descriptorName = /^([1-9][0-9]*)-([a-f0-9]{64})\.json$/;
const filterName = /^[A-Za-z0-9_-]{1,48}$/;
const tokenText = /^[a-f0-9]{64}$/;
const failure = () => new errs.ConfigurationError("WASI HTTP execution failed");

async function privateKey(directory) {
	const filename = path.join(directory, "wasi-host.key");
	let key;
	try {
		key = await readWasmFile(filename, 32);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
		await writeWasmArtifact(filename, randomBytes(32));
		key = await readWasmFile(filename, 32);
	}
	if (key.length !== 32) throw failure();
	const info = await fs.lstat(filename);
	if (info.uid !== (process.getuid?.() ?? 0) || (info.mode & 0o077) !== 0) throw failure();
	return key;
}

async function socketDirectory(directory) {
	const uid = process.getuid?.() ?? 0;
	const runtime = path.join(os.tmpdir(), `shieldpm-wasi-${uid}-${digest(directory).slice(0, 24)}`);
	try {
		await fs.mkdir(runtime, { mode: 0o700 });
	} catch (error) {
		if (error.code !== "EEXIST") throw error;
	}
	const info = await fs.lstat(runtime);
	if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== uid || (info.mode & 0o077) !== 0)
		throw new errs.ConfigurationError("Unsafe WASI HTTP runtime directory");
	return runtime;
}

async function removeStaleSocket(filename) {
	let before;
	try {
		before = await fs.lstat(filename);
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}
	if (!before.isSocket() || before.uid !== (process.getuid?.() ?? 0)) throw failure();
	const active = await new Promise((resolve, reject) => {
		const client = net.connect(filename);
		client.setTimeout(1000);
		client.once("connect", () => {
			client.destroy();
			resolve(true);
		});
		client.once("timeout", () => {
			client.destroy();
			reject(failure());
		});
		client.once("error", (error) => {
			const code = /** @type {NodeJS.ErrnoException} */ (error).code;
			if (code === "ECONNREFUSED" || code === "ENOENT") resolve(false);
			else reject(failure());
		});
	});
	if (active) throw new errs.ConfigurationError("WASI HTTP bridge is already running");
	const after = await fs.lstat(filename).catch((error) => {
		if (error.code !== "ENOENT") throw error;
		return null;
	});
	if (after && (after.dev !== before.dev || after.ino !== before.ino || !after.isSocket())) throw failure();
	if (after) await fs.unlink(filename);
}

async function acceptedFilter(directory, configuration, id, suppliedToken) {
	const match = descriptorName.exec(configuration);
	if (!match || !filterName.test(id) || typeof suppliedToken !== "string" || !tokenText.test(suppliedToken))
		throw failure();
	const contents = await readWasmFile(path.join(directory, "hosts", configuration), 1024 * 1024);
	if (digest(contents) !== match[2]) throw failure();
	const chain = JSON.parse(contents.toString("utf8"));
	if (chain.version !== 1 || Number(chain.host_id) !== Number(match[1]) || !Array.isArray(chain.filters))
		throw failure();
	const filter = chain.filters.find((entry) => entry.id === id && entry.kind === "application");
	if (
		!filter ||
		typeof filter.bridge_token !== "string" ||
		!tokenText.test(filter.bridge_token) ||
		!timingSafeEqual(Buffer.from(suppliedToken, "hex"), Buffer.from(filter.bridge_token, "hex"))
	)
		throw failure();
	const sha256 = moduleIdentifier(filter.sha256);
	// The descriptor's arbitrary path field is never followed. Only its verified content digest selects bytecode.
	const bytes = await readWasmFile(path.join(directory, "artifacts", `${sha256}.wasm`));
	if (digest(bytes) !== sha256) throw failure();
	if (
		!["handler", "filter"].includes(filter.mode) ||
		!["stdio", "http-json-v1"].includes(filter.protocol) ||
		(filter.mode === "filter" && filter.protocol !== "http-json-v1")
	)
		throw failure();
	return { filter, bytes };
}

async function readPacket(req) {
	const chunks = [];
	let length = 0;
	for await (const chunk of req) {
		length += chunk.length;
		if (length > MAX_WASI_HTTP_PACKET_BYTES) throw failure();
		chunks.push(chunk);
	}
	const packet = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	if (
		!packet ||
		typeof packet !== "object" ||
		Array.isArray(packet) ||
		packet.version !== 1 ||
		Object.keys(packet).some((name) => !["version", "request"].includes(name))
	)
		throw failure();
	return normalizeWasiHttpRequest(packet.request).request;
}

/** Prepare a stable private authentication key and start the separate local-only listener before preflight. */
export async function prepareWasiHostBridge() {
	const directory = root();
	if (!bridges.has(directory)) {
		const pending = startBridge(directory).catch((error) => {
			bridges.delete(directory);
			throw error;
		});
		bridges.set(directory, pending);
	}
	return bridges.get(directory);
}

async function startBridge(directory) {
	await wasmDirectory(directory);
	const key = await privateKey(directory);
	// This executor can prohibit AF_UNIX. CI and all production starts retain the private Unix transport.
	const testTcp = process.env.NODE_ENV === "test" && process.env.SHIELDPM_WASM_PREFLIGHT_TCP === "1";
	const socket = testTcp ? null : path.join(await socketDirectory(directory), "http.sock");
	if (socket && Buffer.byteLength(socket) > 103)
		throw new errs.ConfigurationError("WASI HTTP socket path is too long");
	if (socket) await removeStaleSocket(socket);
	const controllers = new Set();
	const server = http.createServer({ maxHeaderSize: 4096 }, async (req, res) => {
		const controller = new AbortController();
		const disconnected = () => {
			if (!res.writableEnded) controller.abort();
		};
		controllers.add(controller);
		req.once("aborted", disconnected);
		res.once("close", disconnected);
		res.setHeader("Cache-Control", "no-store");
		res.setHeader("Connection", "close");
		try {
			const match = /^\/execute\/([1-9][0-9]*-[a-f0-9]{64}\.json)\/([A-Za-z0-9_-]{1,48})$/.exec(req.url || "");
			if (req.method !== "POST" || !match || req.headers["content-type"] !== "application/json") throw failure();
			const { filter, bytes } = await acceptedFilter(
				directory,
				match[1],
				match[2],
				req.headers["x-shieldpm-wasi-token"],
			);
			const request = await readPacket(req);
			const result = await runWasiHttpApplication(bytes, filter.settings ?? {}, request, {
				protocol: filter.protocol,
				signal: controller.signal,
			});
			if (result.status !== "completed" || result.exit_code !== 0 || result.truncated) throw failure();
			const output = JSON.stringify(parseWasiHttpResult(result.stdout, filter));
			if (!res.destroyed) {
				res.setHeader("Content-Type", "application/json");
				res.setHeader("Content-Length", Buffer.byteLength(output));
				res.end(output);
			}
		} catch {
			// No arguments, request headers, body, stderr or guest diagnostics enter a public/logging error channel.
			if (!res.destroyed) {
				res.statusCode = 503;
				res.setHeader("Content-Length", "0");
				res.end();
			}
		} finally {
			controllers.delete(controller);
			req.off("aborted", disconnected);
			res.off("close", disconnected);
		}
	});
	server.maxConnections = 32;
	server.requestTimeout = 5000;
	server.headersTimeout = 5000;
	server.keepAliveTimeout = 1;
	server.maxRequestsPerSocket = 1;
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		const ready = () => {
			server.off("error", reject);
			resolve(undefined);
		};
		if (testTcp) server.listen(0, "127.0.0.1", ready);
		else server.listen(socket, ready);
	});
	if (socket) await fs.chmod(socket, 0o600);
	server.unref();
	return {
		socket_path: socket || `tcp:127.0.0.1:${/** @type {net.AddressInfo} */ (server.address()).port}`,
		tokenFor: (binding) => createHmac("sha256", key).update(binding).digest("hex"),
		server,
		controllers,
	};
}

/** Stop accepting requests and cancel actual guest processes, including tests using isolated DATA_PATH values. */
export async function stopWasiHostBridges() {
	const pending = [...bridges.values()];
	bridges.clear();
	await Promise.all(
		pending.map(async (value) => {
			const bridge = await value;
			for (const controller of bridge.controllers) controller.abort();
			await new Promise((resolve) => {
				bridge.server.close(resolve);
				bridge.server.closeAllConnections();
			});
			if (!bridge.socket_path.startsWith("tcp:")) await fs.rm(bridge.socket_path, { force: true });
		}),
	);
}
