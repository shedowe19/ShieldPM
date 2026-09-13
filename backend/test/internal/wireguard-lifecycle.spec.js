import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	peers: [],
	settings: {},
	exec: vi.fn(),
	spawn: vi.fn(),
	write: vi.fn(),
	settingsPatch: vi.fn(),
}));
vi.mock("node:child_process", () => ({ execSync: mocks.exec, spawn: mocks.spawn }));
vi.mock("node:fs", () => ({
	default: { existsSync: () => true, readFileSync: () => "server-key", writeFileSync: mocks.write },
}));
vi.mock("../../logger.js", () => ({ global: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("../../models/setting.js", () => ({
	default: {
		query: () => ({
			where: () => ({
				first: async () => ({ meta: mocks.settings }),
				patch: mocks.settingsPatch,
			}),
		}),
	},
}));
vi.mock("../../models/wireguard_peer.js", () => ({
	default: {
		query: () => {
			const predicates = [];
			let patch;
			const matches = () => mocks.peers.filter((row) => predicates.every((test) => test(row)));
			const query = {
				where: (field, operator, value) => {
					predicates.push((row) =>
						value === undefined
							? row[field] === operator
							: operator === "!="
								? row[field] !== value
								: row[field] === value,
					);
					return query;
				},
				andWhere: (...args) => query.where(...args),
				findById: (id) => {
					query.where("id", id);
					query.single = true;
					return query;
				},
				patch: (data) => {
					patch = data;
					return query;
				},
				insert: async (data) => {
					await new Promise((resolve) => setTimeout(resolve, 1));
					const peer = { ...data, id: mocks.peers.length + 1, is_deleted: 0 };
					mocks.peers.push(peer);
					return peer;
				},
				// biome-ignore lint/suspicious/noThenProperty: models expose thenable query builders.
				then: (resolve, reject) => {
					const rows = matches();
					if (patch) for (const row of rows) Object.assign(row, patch);
					return Promise.resolve(query.single ? rows[0] : rows).then(resolve, reject);
				},
			};
			return query;
		},
	},
}));

import wireguard from "../../internal/wireguard.js";

describe("WireGuard lifecycle and address allocation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.peers = [];
		mocks.settings = {
			endpoint: "vpn.example.com",
			listen_port: 51820,
			subnet: "10.8.0.0/24",
			server_address: "10.8.0.1/24",
		};
		mocks.exec.mockReturnValue("key");
		mocks.settingsPatch.mockImplementation(async ({ meta }) => {
			mocks.settings = JSON.parse(meta);
		});
		mocks.spawn.mockImplementation(() => {
			const child = Object.assign(new EventEmitter(), {
				stdin: new EventEmitter(),
				stdout: new EventEmitter(),
				stderr: new EventEmitter(),
			});
			child.stdin.write = vi.fn();
			child.stdin.end = () =>
				queueMicrotask(() => {
					child.stdout.emit("data", "public-key");
					child.emit("close", 0);
				});
			return child;
		});
	});
	it("preserves disabled peers across startup and excludes them from the server config", async () => {
		mocks.peers = [{ id: 1, is_deleted: 0, status: 0, name: "disabled", client_public_key: "disabled-key" }];
		await wireguard.init();
		expect(mocks.peers[0].status).toBe(0);
		const config = mocks.write.mock.calls.find(([file]) => file.endsWith("wg0.conf"))[1];
		expect(config).not.toContain("disabled-key");
	});
	it("allocates distinct IPs for concurrent peer creation", async () => {
		const peers = await Promise.all([
			wireguard.createPeer({ name: "first" }, 1),
			wireguard.createPeer({ name: "second" }, 1),
		]);
		expect(peers.map((peer) => peer.client_address)).toEqual(["10.8.0.2/32", "10.8.0.3/32"]);
	});
	it("validates a subnet change after an in-flight peer creation finishes", async () => {
		let finishKey;
		mocks.spawn.mockImplementation(() => {
			const child = Object.assign(new EventEmitter(), {
				stdin: new EventEmitter(),
				stdout: new EventEmitter(),
				stderr: new EventEmitter(),
			});
			child.stdin.write = () => {};
			child.stdin.end = () => {
				finishKey = () => {
					child.stdout.emit("data", "public-key");
					child.emit("close", 0);
				};
			};
			return child;
		});
		const creation = wireguard.createPeer({ name: "client" }, 1);
		await vi.waitFor(() => expect(finishKey).toBeTypeOf("function"));
		const update = wireguard.updateSettings({ subnet: "10.9.0.0/24", server_address: "10.9.0.1/24" });
		const rejected = expect(update).rejects.toThrow("existing peer");
		finishKey();
		await creation;
		await rejected;
		expect(mocks.settingsPatch).not.toHaveBeenCalled();
		expect(mocks.peers[0].client_address).toBe("10.8.0.2/32");
	});
	it("rejects subnet changes and server addresses that conflict with existing clients before persisting", async () => {
		mocks.peers = [{ id: 1, is_deleted: 0, client_address: "10.8.0.2/32" }];
		await expect(
			wireguard.updateSettings({ subnet: "10.9.0.0/24", server_address: "10.9.0.1/24" }),
		).rejects.toThrow("existing peer");
		await expect(wireguard.updateSettings({ server_address: "10.8.0.2/24" })).rejects.toThrow("existing peer");
		expect(mocks.settingsPatch).not.toHaveBeenCalled();
	});
	it("restarts the interface when its configured address changes", async () => {
		await wireguard.updateSettings({ server_address: "10.8.0.5/24" });
		expect(mocks.exec.mock.calls.some(([command]) => command.startsWith("wg-quick down"))).toBe(true);
		expect(mocks.exec.mock.calls.some(([command]) => command.includes("wg syncconf"))).toBe(false);
	});
	it("reports an unavailable interface instead of claiming configuration was applied", async () => {
		mocks.exec.mockImplementation((command) => {
			if (command.includes("wg-quick") || command.includes("wg syncconf")) throw new Error("interface failure");
			return "key";
		});
		await expect(wireguard.updateSettings({ listen_port: 51821 })).rejects.toThrow("interface failure");
	});
	it("handles a broken stdin pipe without an uncaught error", async () => {
		mocks.spawn.mockImplementation(() => {
			const child = Object.assign(new EventEmitter(), {
				stdin: new EventEmitter(),
				stdout: new EventEmitter(),
				stderr: new EventEmitter(),
			});
			child.stdin.write = () => {};
			child.stdin.end = () => queueMicrotask(() => child.stdin.emit("error", new Error("EPIPE")));
			return child;
		});
		await expect(wireguard.createPeer({ name: "client" }, 1)).rejects.toThrow("EPIPE");
		expect(mocks.spawn).toHaveBeenCalledWith("wg", ["pubkey"], expect.objectContaining({ timeout: 10000 }));
	});
});
