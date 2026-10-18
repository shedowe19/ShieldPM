import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ children: [] }));
vi.mock("node:child_process", async (original) => {
	const actual = await original();
	return {
		...actual,
		fork: (...args) => {
			const child = actual.fork(...args);
			state.children.push(child);
			return child;
		},
	};
});

import { prepareWasiHostBridge, stopWasiHostBridges } from "../../internal/wasi-host-bridge.js";
import { writeWasmArtifact } from "../../internal/wasm-modules.js";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const request = {
	method: "POST",
	uri: "/application",
	query: "format=plain",
	host: "host.example.test",
	scheme: "https",
	remote_addr: "192.0.2.8",
	headers: [{ name: "Content-Type", value: "application/octet-stream" }],
	body_base64: "",
};
const packet = () => ({ version: 1, request: structuredClone(request) });
const waitFor = async (check) => {
	const deadline = Date.now() + 3000;
	while (Date.now() < deadline) {
		if (check()) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error("Timed out waiting for real WASI child");
};

describe("private Unix HTTP bridge for host WASI applications", () => {
	let directory;
	let bridge;
	let prepared;
	const target = () => {
		if (!bridge.socket_path.startsWith("tcp:")) return { socketPath: bridge.socket_path };
		const address = new URL(`http://${bridge.socket_path.slice(4)}`);
		return { host: address.hostname, port: Number(address.port) };
	};
	const materialize = async (name = "standalone-wasi-memory-growth", overrides = {}) => {
		const bytes = await fs.readFile(new URL(`../fixtures/${name}.wasm`, import.meta.url));
		const sha256 = hash(bytes);
		const token = bridge.tokenFor("91:private-policy:application");
		const chain = {
			version: 1,
			host_id: 91,
			filters: [
				{
					id: "application",
					kind: "application",
					sha256,
					mode: "handler",
					protocol: "stdio",
					settings: { timeout_ms: 1000 },
					bridge_token: token,
					...overrides,
				},
			],
		};
		const contents = Buffer.from(JSON.stringify(chain));
		const configuration = `91-${hash(contents)}.json`;
		await writeWasmArtifact(path.join(directory, "wasm/artifacts", `${sha256}.wasm`), bytes);
		await writeWasmArtifact(path.join(directory, "wasm/hosts", configuration), contents);
		return { configuration, token, sha256, chain, url: `/execute/${configuration}/application` };
	};
	const post = (body = packet(), options = {}) =>
		new Promise((resolve, reject) => {
			const contents = typeof body === "string" ? body : JSON.stringify(body);
			const req = http.request(
				{
					...target(),
					path: options.url ?? prepared.url,
					method: options.method ?? "POST",
					headers: {
						"Content-Type": "application/json",
						"X-ShieldPM-Wasi-Token": options.token ?? prepared.token,
						...options.headers,
					},
					agent: false,
				},
				(response) => {
					let received = "";
					response.setEncoding("utf8");
					response.on("data", (chunk) => {
						received += chunk;
					});
					response.on("error", reject);
					response.on("end", () =>
						resolve({ status: response.statusCode, headers: response.headers, body: received }),
					);
				},
			);
			req.on("error", reject);
			req.end(contents);
		});
	beforeEach(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "wasi-host-bridge-"));
		vi.stubEnv("DATA_PATH", directory);
		bridge = await prepareWasiHostBridge();
		prepared = await materialize();
	});
	afterEach(async () => {
		await stopWasiHostBridges();
		await Promise.all(
			state.children.splice(0).map(
				(child) =>
					new Promise((resolve) => {
						if (child.exitCode !== null || child.signalCode !== null) return resolve();
						child.once("close", resolve);
						child.kill("SIGKILL");
					}),
			),
		);
		vi.unstubAllEnvs();
		if (bridge && !bridge.socket_path.startsWith("tcp:"))
			await fs.rm(path.dirname(bridge.socket_path), { recursive: true, force: true });
		if (directory) await fs.rm(directory, { recursive: true, force: true });
	});
	it("executes real approved bytecode and keeps listener, key and responses private", async () => {
		const response = await post();
		expect(response).toMatchObject({ status: 200, headers: { "cache-control": "no-store" } });
		expect(JSON.parse(response.body)).toEqual({
			version: 1,
			action: "respond",
			response: {
				status: 200,
				headers: [{ name: "Content-Type", value: "text/plain; charset=utf-8" }],
				body_base64: "",
			},
		});
		expect(state.children).toHaveLength(1);
		expect(state.children[0].exitCode).toBe(0);
		expect(bridge.socket_path.startsWith(`${directory}${path.sep}`)).toBe(false);
		expect((await fs.stat(path.join(directory, "wasm/wasi-host.key"))).mode & 0o077).toBe(0);
	});
	it("keeps the real Unix socket and its parent private", async (context) => {
		if (bridge.socket_path.startsWith("tcp:"))
			context.skip("Executor disallows Unix sockets; CI verifies their mode");
		for (const filename of [bridge.socket_path, path.dirname(bridge.socket_path)])
			expect((await fs.stat(filename)).mode & 0o077).toBe(0);
	});
	it.each(["", "0".repeat(64), "a".repeat(63), "A".repeat(64)])(
		"rejects unavailable or incorrect chain credentials before spawning: %s",
		async (token) => {
			expect(await post(packet(), { token })).toMatchObject({ status: 503, body: "" });
			expect(state.children).toHaveLength(0);
		},
	);
	it.each([
		"/execute/../application",
		"/execute/%2e%2e/application",
		"/execute/91-not-a-content-hash.json/application",
		"/execute/0-HASH.json/application",
	])("rejects malformed or escaping descriptor paths: %s", async (url) => {
		expect(await post(packet(), { url })).toMatchObject({ status: 503, body: "" });
		expect(state.children).toHaveLength(0);
	});
	it("binds tokens to the immutable chain and selected application entry", async () => {
		expect(await post(packet(), { token: bridge.tokenFor("91:another-policy:application") })).toMatchObject({
			status: 503,
		});
		expect(await post(packet(), { url: prepared.url.replace(/application$/, "other-filter") })).toMatchObject({
			status: 503,
		});
		expect(await post(packet(), { url: prepared.url.replace("/91-", "/92-") })).toMatchObject({ status: 503 });
		expect(state.children).toHaveLength(0);
	});
	it("rejects changed descriptor bytes and changed bytecode digests before spawning", async () => {
		const descriptor = path.join(directory, "wasm/hosts", prepared.configuration);
		const contents = await fs.readFile(descriptor);
		await fs.writeFile(descriptor, Buffer.concat([contents, Buffer.from(" ")]));
		expect(await post()).toMatchObject({ status: 503 });
		await fs.writeFile(descriptor, contents);
		await fs.writeFile(path.join(directory, "wasm/artifacts", `${prepared.sha256}.wasm`), Buffer.from("tampered"));
		expect(await post()).toMatchObject({ status: 503 });
		expect(state.children).toHaveLength(0);
	});
	it("never follows descriptor-supplied arbitrary artifact paths", async () => {
		prepared = await materialize("standalone-wasi-memory-growth", { path: "/unavailable/outside-data.wasm" });
		expect(await post()).toMatchObject({ status: 200 });
		expect(state.children).toHaveLength(1);
	});
	it.each([
		["execution settings", { version: 1, request, settings: { timeout_ms: 60000 } }],
		["program digest", { version: 1, request: { ...request, application_id: "b".repeat(64) } }],
		[
			"oversized body",
			{ version: 1, request: { ...request, body_base64: Buffer.alloc(65537).toString("base64") } },
		],
		[
			"header injection",
			{ version: 1, request: { ...request, headers: [{ name: "X-Test", value: "a\r\nAuthorization: secret" }] } },
		],
		["noncanonical base64", { version: 1, request: { ...request, body_base64: "YQ==\n" } }],
	])("rejects caller overrides and malformed exchanges: %s", async (_name, body) => {
		expect(await post(body)).toMatchObject({ status: 503, body: "" });
		expect(state.children).toHaveLength(0);
	});
	it("bounds the entire bridge envelope before starting a guest", async () => {
		const response = await post(" ".repeat(256 * 1024 + 1)).catch((error) => {
			if (error.code !== "ECONNRESET") throw error;
			return { status: 503 };
		});
		expect(response).toMatchObject({ status: 503 });
		expect(state.children).toHaveLength(0);
	});
	it("rejects hard-linked and symlinked chain descriptors", async () => {
		const filename = path.join(directory, "wasm/hosts", prepared.configuration);
		const alternate = path.join(directory, "wasm/hosts", "alternate");
		await fs.link(filename, alternate);
		expect(await post()).toMatchObject({ status: 503 });
		await fs.unlink(alternate);
		await fs.rename(filename, alternate);
		await fs.symlink(alternate, filename);
		expect(await post()).toMatchObject({ status: 503 });
		expect(state.children).toHaveLength(0);
	});
	it("kills a real guest on HTTP disconnect and releases capacity for the next request", async () => {
		prepared = await materialize("standalone-wasi-infinite", { settings: { timeout_ms: 60000 } });
		const req = http.request({
			...target(),
			path: prepared.url,
			method: "POST",
			agent: false,
			headers: { "Content-Type": "application/json", "X-ShieldPM-Wasi-Token": prepared.token },
		});
		req.on("error", () => {});
		req.end(JSON.stringify(packet()));
		await waitFor(() => state.children.length === 1);
		const child = state.children[0];
		const closed = new Promise((resolve) => child.once("close", resolve));
		req.destroy();
		await closed;
		expect(child.signalCode).toBe("SIGKILL");
		prepared = await materialize();
		expect(await post()).toMatchObject({ status: 200 });
	});
	it("keeps an unchanged accepted chain usable after the backend bridge restarts", async () => {
		const token = prepared.token;
		await stopWasiHostBridges();
		bridge = await prepareWasiHostBridge();
		expect(bridge.tokenFor("91:private-policy:application")).toBe(token);
		expect(await post()).toMatchObject({ status: 200 });
	});
});
