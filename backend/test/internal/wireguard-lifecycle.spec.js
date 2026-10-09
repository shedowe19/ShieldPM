import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	peers: [],
	settings: {},
	exec: vi.fn(),
	spawn: vi.fn(),
	write: vi.fn(),
	read: vi.fn(),
	qrcode: vi.fn(),
	logError: vi.fn(),
	settingsPatch: vi.fn(),
}));
vi.mock("node:child_process", () => ({ execSync: mocks.exec, spawn: mocks.spawn }));
vi.mock("node:fs", () => ({
	default: { existsSync: () => true, readFileSync: mocks.read, writeFileSync: mocks.write },
}));
vi.mock("qrcode", () => ({ default: { toDataURL: mocks.qrcode } }));
vi.mock("../../logger.js", () => ({ global: { error: mocks.logError, warn: vi.fn(), info: vi.fn() } }));
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
		mocks.read.mockReturnValue("server-key");
		mocks.write.mockImplementation(() => {});
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
		const cause = new Error("interface failure with private command details");
		mocks.exec.mockImplementation((command) => {
			if (command.includes("wg-quick") || command.includes("wg syncconf")) throw cause;
			return "key";
		});
		await expect(wireguard.updateSettings({ listen_port: 51821 })).rejects.toMatchObject({
			name: "InternalError",
			message: "WireGuard command failed",
			status: 500,
			public: false,
			previous: cause,
		});
	});
	it("handles a broken stdin pipe without an uncaught error", async () => {
		const cause = new Error("EPIPE");
		mocks.spawn.mockImplementation(() => {
			const child = Object.assign(new EventEmitter(), {
				stdin: new EventEmitter(),
				stdout: new EventEmitter(),
				stderr: new EventEmitter(),
			});
			child.stdin.write = () => {};
			child.stdin.end = () => queueMicrotask(() => child.stdin.emit("error", cause));
			return child;
		});
		await expect(wireguard.createPeer({ name: "client" }, 1)).rejects.toMatchObject({
			name: "InternalError",
			message: "WireGuard command input failed",
			status: 500,
			public: false,
			previous: cause,
		});
		expect(mocks.spawn).toHaveBeenCalledWith("wg", ["pubkey"], expect.objectContaining({ timeout: 10000 }));
	});
	it.each(["updatePeer", "enablePeer", "disablePeer", "generateClientConfig"])(
		"returns a public 404 when %s loses a peer after the route lookup",
		async (method) => {
			await expect(wireguard[method](42, {})).rejects.toMatchObject({
				name: "ItemNotFoundError",
				status: 404,
				public: true,
			});
			expect(mocks.write).not.toHaveBeenCalled();
			expect(mocks.spawn).not.toHaveBeenCalled();
		},
	);
	it("keeps a nonzero key-command exit and stderr private", async () => {
		mocks.spawn.mockImplementation(() => {
			const child = Object.assign(new EventEmitter(), {
				stdin: new EventEmitter(),
				stdout: new EventEmitter(),
				stderr: new EventEmitter(),
			});
			child.stdin.write = vi.fn();
			child.stdin.end = () =>
				queueMicrotask(() => {
					child.stderr.emit("data", "private-key echoed in diagnostics");
					child.emit("close", 1);
				});
			return child;
		});
		await expect(wireguard.createPeer({ name: "client" }, 1)).rejects.toMatchObject({
			name: "InternalError",
			message: "WireGuard command failed",
			status: 500,
			public: false,
			previous: { name: "CommandError", code: 1, public: false },
		});
		expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain("private-key echoed");
	});
	it("returns an actionable configuration error when the WireGuard CLI is unavailable", async () => {
		mocks.exec.mockImplementation(() => {
			throw new Error("which wg failed");
		});
		await expect(wireguard.createPeer({ name: "client" }, 1)).rejects.toMatchObject({
			name: "ConfigurationError",
			message: "WireGuard is not available on this system",
			status: 400,
			public: true,
		});
		expect(mocks.spawn).not.toHaveBeenCalled();
	});
	it("reports exhausted addresses without inserting or applying a peer", async () => {
		mocks.peers = Array.from({ length: 253 }, (_, index) => ({
			id: index + 1,
			is_deleted: 0,
			client_address: `10.8.0.${index + 2}/32`,
		}));
		await expect(wireguard.createPeer({ name: "client" }, 1)).rejects.toMatchObject({
			name: "ConfigurationError",
			message: "No available IPs in WireGuard subnet",
			status: 400,
			public: true,
		});
		expect(mocks.peers).toHaveLength(253);
		expect(mocks.write).not.toHaveBeenCalled();
	});
	it("keeps key file and configuration write diagnostics private", async () => {
		const cause = new Error("EACCES: private-key file path");
		mocks.read.mockImplementationOnce(() => {
			throw cause;
		});
		await expect(wireguard.updateSettings({ listen_port: 51821 })).rejects.toMatchObject({
			name: "InternalError",
			message: "WireGuard server key could not be read",
			status: 500,
			public: false,
			previous: cause,
		});
		mocks.write.mockImplementationOnce(() => {
			throw cause;
		});
		await expect(wireguard.updateSettings({ listen_port: 51822 })).rejects.toMatchObject({
			name: "InternalError",
			message: "WireGuard configuration could not be written",
			status: 500,
			public: false,
			previous: cause,
		});
	});
	it("preserves QR failure causes without echoing client configuration diagnostics", async () => {
		mocks.peers = [{ id: 1, is_deleted: 0, name: "client", allowed_ips: "10.8.0.0/24" }];
		const cause = new Error("private client configuration");
		mocks.qrcode.mockRejectedValueOnce(cause);
		await expect(wireguard.generateQRCode(1)).rejects.toMatchObject({
			name: "InternalError",
			message: "QR code generation is not available. Ensure the 'qrcode' npm package is installed.",
			status: 500,
			public: false,
			previous: cause,
		});
	});
});
