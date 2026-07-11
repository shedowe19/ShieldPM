import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execSync: vi.fn(),
	existsSync: vi.fn(),
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
	mkdirSync: vi.fn(),
	patchSettings: vi.fn(),
	peerQuery: vi.fn(),
	readFileSync: vi.fn(),
	settingQuery: vi.fn(),
	spawn: vi.fn(),
	writeFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({ execSync: mocks.execSync, spawn: mocks.spawn }));
vi.mock("node:fs", () => ({
	default: {
		existsSync: mocks.existsSync,
		mkdirSync: mocks.mkdirSync,
		readFileSync: mocks.readFileSync,
		writeFileSync: mocks.writeFileSync,
	},
}));
vi.mock("../../logger.js", () => ({ global: mocks.logger }));
vi.mock("../../models/setting.js", () => ({ default: { query: mocks.settingQuery } }));
vi.mock("../../models/wireguard_peer.js", () => ({ default: { query: mocks.peerQuery } }));

import internalWireguard from "../../internal/wireguard.js";

const createPeerQuery = (result = []) => {
	const query = Promise.resolve(result);
	Object.assign(query, {
		andWhere: () => query,
		patch: () => query,
		where: () => query,
	});
	return query;
};

const flushMicrotasks = async () => {
	for (let index = 0; index < 10; index++) {
		await Promise.resolve();
	}
};

describe("WireGuard settings validation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.settingQuery.mockImplementation(() => ({
			where: () => ({
				first: async () => ({
					meta: {
						endpoint: "vpn.example.com",
						listen_port: 51820,
						server_address: "10.8.0.1/24",
						subnet: "10.8.0.0/24",
					},
				}),
				patch: mocks.patchSettings,
			}),
		}));
		mocks.peerQuery.mockImplementation(() => createPeerQuery());
		mocks.execSync.mockImplementation((command) => {
			if (command === "which wg") throw new Error("WireGuard unavailable");
			return "";
		});
	});

	it.each([
		["unknown keys", { endpoint: "vpn.example.com", post_up: "iptables -F" }],
		["newline injection", { endpoint: "vpn.example.com\nPostUp = iptables -F FORWARD" }],
		["out-of-range ports", { listen_port: 65536 }],
		["invalid IPv4 CIDRs", { subnet: "10.8.0.0/99" }],
		["CIDRs unsupported by the peer allocator", { subnet: "10.8.0.0/25", server_address: "10.8.0.1/25" }],
		["server addresses outside the configured subnet", { server_address: "10.9.0.1/24" }],
	])("rejects %s before persisting settings", async (_description, data) => {
		await expect(internalWireguard.updateSettings(data)).rejects.toMatchObject({ status: 400 });
		expect(mocks.patchSettings).not.toHaveBeenCalled();
	});

	it("waits for server key creation before synchronizing the startup configuration", async () => {
		let emitKeyGenerationComplete;
		const knownFiles = new Set();
		mocks.existsSync.mockImplementation((path) => knownFiles.has(path));
		mocks.readFileSync.mockImplementation((path) => {
			if (!knownFiles.has(path)) throw new Error("server private key is not ready");
			return "server-private-key";
		});
		mocks.writeFileSync.mockImplementation((path) => knownFiles.add(path));
		mocks.execSync.mockImplementation((command) => {
			if (command === "which wg") return "/usr/bin/wg";
			if (command === "wg genkey") return "server-private-key";
			if (command.startsWith("ip link show")) throw new Error("wg0 is down");
			return "";
		});
		mocks.spawn.mockImplementation(() => {
			const handlers = { close: [], data: [], error: [] };
			emitKeyGenerationComplete = () => {
				for (const handler of handlers.data) handler(Buffer.from("server-public-key"));
				for (const handler of handlers.close) handler(0);
			};
			return {
				stderr: { on: () => {} },
				stdin: { end: vi.fn(), write: vi.fn() },
				stdout: { on: (_event, handler) => handlers.data.push(handler) },
				on: (event, handler) => handlers[event].push(handler),
			};
		});

		let initialized = false;
		const initialization = internalWireguard.init().then(() => {
			initialized = true;
		});
		await flushMicrotasks();

		expect(initialized).toBe(false);
		emitKeyGenerationComplete();
		await initialization;

		const config = mocks.writeFileSync.mock.calls.find(([path]) => path.endsWith("/wireguard/wg0.conf"))?.[1];
		expect(config).toContain("PrivateKey = server-private-key");
	});
});
