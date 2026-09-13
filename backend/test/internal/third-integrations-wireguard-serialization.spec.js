import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	peer: null,
	write: vi.fn(),
	patch: vi.fn(),
	patchAndFetch: vi.fn(),
	reads: vi.fn(),
}));
vi.mock("node:child_process", () => ({ execSync: () => "", spawn: vi.fn() }));
vi.mock("node:fs", () => ({
	default: { existsSync: () => true, readFileSync: () => "server-key", writeFileSync: state.write },
}));
vi.mock("../../models/setting.js", () => ({
	default: { query: () => ({ where: () => ({ first: async () => null }) }) },
}));
vi.mock("../../models/wireguard_peer.js", () => ({
	default: {
		query: () => {
			const filters = [];
			let single = false;
			const query = {
				where: (key, operator, value) => {
					filters.push((row) => (value === undefined ? row[key] === operator : row[key] !== value));
					return query;
				},
				andWhere: (...args) => query.where(...args),
				findById: (id) => {
					single = true;
					return query.where("id", id);
				},
				// biome-ignore lint/suspicious/noThenProperty: Objection queries are thenable.
				then: (resolve, reject) => {
					state.reads();
					const rows = [state.peer].filter((row) => filters.every((predicate) => predicate(row)));
					return Promise.resolve(single ? rows[0] : rows).then(resolve, reject);
				},
			};
			return query;
		},
	},
}));

import wireguard from "../../internal/wireguard.js";

describe("WireGuard mutation serialization", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		state.peer = {
			id: 7,
			is_deleted: 0,
			status: 2,
			name: "peer",
			client_public_key: "peer-public-key",
			$query: () => ({ patch: state.patch, patchAndFetch: state.patchAndFetch }),
		};
		state.patch.mockImplementation(async (data) => Object.assign(state.peer, data));
	});
	it.each(["disablePeer", "deletePeer", "enablePeer"])(
		"queues %s until a pending update and configuration application finish",
		async (method) => {
			let finishUpdate;
			state.patchAndFetch.mockImplementation(
				(data) =>
					new Promise((resolve) => {
						finishUpdate = () => resolve(Object.assign(state.peer, data));
					}),
			);
			const updating = wireguard.updatePeer(7, { name: "changed" });
			await vi.waitFor(() => expect(finishUpdate).toBeTypeOf("function"));
			const mutation = wireguard[method](7);
			await Promise.resolve();
			await Promise.resolve();
			expect(state.patch).not.toHaveBeenCalled();
			finishUpdate();
			await Promise.all([updating, mutation]);
			expect(state.write).toHaveBeenCalledTimes(2);
			const finalConfig = state.write.mock.calls.at(-1)[1];
			if (method === "enablePeer") expect(finalConfig).toContain("peer-public-key");
			else expect(finalConfig).not.toContain("peer-public-key");
		},
	);
});
