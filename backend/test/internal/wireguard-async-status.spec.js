import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	commands: [],
	active: 0,
	maxActive: 0,
	failDump: false,
	peers: [],
	reads: 0,
	writes: [],
	sync: vi.fn(),
}));
vi.mock("node:child_process", async (original) => {
	const actual = await original();
	return {
		...actual,
		execSync: state.sync,
		execFile: (binary, args, options, callback) => {
			state.commands.push({ binary, args, options });
			state.active++;
			state.maxActive = Math.max(state.maxActive, state.active);
			const dump =
				"private-interface-key\tpublic-interface-key\t51820\t0\nowned\tpsk\tendpoint\t10.8.0.2/32\t100\t200\t300\t0\nforeign\tpsk\tendpoint\t10.8.0.3/32\t100\t400\t500\t0";
			const output = args[0] === "show" ? dump : "available";
			const code =
				state.failDump && args[0] === "show"
					? "process.exit(1)"
					: `process.stdout.write(${JSON.stringify(output)})`;
			return actual.execFile(
				process.execPath,
				["-e", `setTimeout(() => { ${code} }, 20)`],
				options,
				(error, stdout, stderr) => {
					state.active--;
					callback(error, stdout, stderr);
				},
			);
		},
	};
});
vi.mock("node:fs", () => ({ default: { existsSync: () => true, readFileSync: () => "existing-public-key" } }));
vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../models/setting.js", () => ({
	default: { query: () => ({ where: () => ({ first: async () => null }) }) },
}));
vi.mock("../../models/wireguard_peer.js", () => ({
	default: {
		query: () => {
			const filters = [];
			const query = {
				where: (key, value) => {
					filters.push((row) => row[key] === value);
					return query;
				},
				andWhere: (key, operator, value) => {
					filters.push((row) => (operator === "!=" ? row[key] !== value : row[key] === value));
					return query;
				},
				select: (...columns) => {
					expect(columns).not.toContain("client_private_key");
					expect(columns).not.toContain("preshared_key");
					return query;
				},
				// biome-ignore lint/suspicious/noThenProperty: Objection queries are intentionally thenable.
				then: (resolve, reject) => {
					state.reads++;
					return Promise.resolve(state.peers.filter((row) => filters.every((filter) => filter(row)))).then(
						resolve,
						reject,
					);
				},
			};
			return query;
		},
	},
}));

import wireguard from "../../internal/wireguard.js";
import { invalidateWireguardSnapshot } from "../../lib/wireguard-status.js";

const peer = (id, owner, key) => ({
	id,
	owner_user_id: owner,
	client_public_key: key,
	is_deleted: 0,
	status: 2,
	transfer_rx: 0,
	transfer_tx: 0,
	last_handshake: null,
	$query() {
		return {
			patch: async (data) => {
				state.writes.push({ id, data });
				Object.assign(this, data);
			},
		};
	},
});
beforeEach(() => {
	vi.clearAllMocks();
	invalidateWireguardSnapshot();
	state.commands = [];
	state.active = 0;
	state.maxActive = 0;
	state.failDump = false;
	state.reads = 0;
	state.writes = [];
	state.peers = [peer(1, 7, "owned"), peer(2, 8, "foreign")];
	state.sync.mockImplementation(() => {
		throw new Error("A status request must never execute synchronously");
	});
});
afterEach(() => vi.restoreAllMocks());

describe("non-blocking shared WireGuard observations", () => {
	it("keeps the event loop responsive during real delayed child processes and shares one snapshot", async () => {
		let heartbeats = 0;
		const timer = setInterval(() => {
			heartbeats++;
		}, 2);
		try {
			await Promise.all([
				wireguard.getServerInfo(),
				...Array.from({ length: 20 }, () => wireguard.refreshStatuses(7)),
			]);
		} finally {
			clearInterval(timer);
		}
		expect(heartbeats).toBeGreaterThan(5);
		expect(state.commands.map(({ binary, args }) => [binary, ...args])).toEqual([
			["wg", "--version"],
			["ip", "link", "show", "wg0"],
			["wg", "show", "wg0", "dump"],
		]);
		expect(state.sync).not.toHaveBeenCalled();
		expect(state.reads).toBe(1);
		expect(state.writes).toEqual([
			{ id: 1, data: { transfer_rx: 200, transfer_tx: 300, last_handshake: new Date(100_000) } },
		]);
		for (const { options } of state.commands)
			expect(options).toMatchObject({ timeout: 5000, maxBuffer: 1024 * 1024 });
	});

	it("does not rewrite unchanged counters or another owner's metadata", async () => {
		await wireguard.refreshStatuses(7);
		await wireguard.refreshStatuses(7);
		expect(state.writes).toHaveLength(1);
		expect(state.peers[1]).toMatchObject({ transfer_rx: 0, transfer_tx: 0 });
		await wireguard.refreshStatuses(8);
		expect(state.writes.map(({ id }) => id)).toEqual([1, 2]);
		expect(state.commands).toHaveLength(3);
	});

	it("expires the short snapshot and does not expose a mutable cached Map", async () => {
		let now = Date.now();
		vi.spyOn(Date, "now").mockImplementation(() => now);
		const first = await wireguard.getAllPeerStatuses();
		first.delete("owned");
		expect((await wireguard.getAllPeerStatuses()).has("owned")).toBe(true);
		expect(state.commands).toHaveLength(3);
		now += 2001;
		await wireguard.getAllPeerStatuses();
		expect(state.commands).toHaveLength(6);
	});

	it("cannot republish a delayed snapshot invalidated by a configuration change", async () => {
		const first = wireguard.getAllPeerStatuses();
		await vi.waitFor(() => expect(state.active).toBe(1));
		invalidateWireguardSnapshot();
		const second = wireguard.getAllPeerStatuses();
		await Promise.all([first, second]);
		expect(state.commands).toHaveLength(6);
		expect(state.maxActive).toBe(1);
	});

	it("keeps stored counters when a live dump fails", async () => {
		state.failDump = true;
		await wireguard.refreshStatuses(7);
		expect(state.writes).toEqual([]);
		expect(state.sync).not.toHaveBeenCalled();
	});
});
