import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execSync: vi.fn(),
	logger: { error: vi.fn() },
	peerQuery: vi.fn(),
}));

vi.mock("node:child_process", () => ({ execSync: mocks.execSync, spawn: vi.fn() }));
vi.mock("../../logger.js", () => ({ global: mocks.logger }));
vi.mock("../../models/setting.js", () => ({ default: {} }));
vi.mock("../../models/wireguard_peer.js", () => ({ default: { query: mocks.peerQuery } }));

import internalWireguard from "../../internal/wireguard.js";

const createPeerQuery = (peers) => {
	const filters = [];
	const query = Promise.resolve().then(() =>
		peers.filter((peer) =>
			filters.every(({ field, operator, value }) =>
				operator === "!=" ? peer[field] !== value : peer[field] === value,
			),
		),
	);
	Object.assign(query, {
		andWhere: (field, operator, value) => {
			filters.push({ field, operator: value === undefined ? "=" : operator, value: value ?? operator });
			return query;
		},
		where: (field, value) => {
			filters.push({ field, operator: "=", value });
			return query;
		},
	});
	return query;
};

const createPeer = (id, ownerUserId, publicKey) => {
	const patch = vi.fn();
	return [
		{
			client_public_key: publicKey,
			id,
			is_deleted: 0,
			owner_user_id: ownerUserId,
			status: 2,
			$query: () => ({ patch }),
		},
		patch,
	];
};

describe("WireGuard peer-status refresh ownership", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.execSync.mockImplementation((command) => {
			if (command.startsWith("ip link show")) return "wg0";
			if (command === "/usr/bin/wg show wg0 dump") {
				return [
					"server-private-key\tserver-public-key\t51820\t0",
					"owner-public-key\tendpoint\tallowed-ips\t0\t100\t200\t300\t0",
					"foreign-public-key\tendpoint\tallowed-ips\t0\t200\t400\t500\t0",
				].join("\n");
			}
			return "";
		});
	});

	it("refreshes only the restricted caller's peer status", async () => {
		const [ownedPeer, patchOwnedPeer] = createPeer(1, 7, "owner-public-key");
		const [foreignPeer, patchForeignPeer] = createPeer(2, 8, "foreign-public-key");
		mocks.peerQuery.mockImplementation(() => createPeerQuery([ownedPeer, foreignPeer]));

		await internalWireguard.refreshStatuses(7);

		expect(patchOwnedPeer).toHaveBeenCalledWith({
			last_handshake: expect.any(Date),
			transfer_rx: 200,
			transfer_tx: 300,
		});
		expect(patchForeignPeer).not.toHaveBeenCalled();
	});
});
