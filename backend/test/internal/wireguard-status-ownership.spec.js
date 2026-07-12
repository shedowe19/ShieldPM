import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getStatusHandler: null,
	peerQuery: vi.fn(),
	refreshStatuses: vi.fn(),
}));

vi.mock("express", () => ({
	default: {
		Router: () => {
			const router = {
				delete: () => router,
				get: (path, handler) => {
					if (path === "/status") mocks.getStatusHandler = handler;
					return router;
				},
				post: () => router,
				put: () => router,
				use: () => router,
			};
			return router;
		},
	},
}));
vi.mock("../../internal/audit-log.js", () => ({ default: {} }));
vi.mock("../../internal/wireguard.js", () => ({ default: { refreshStatuses: mocks.refreshStatuses } }));
vi.mock("../../lib/config.js", () => ({ isDemoMode: vi.fn().mockReturnValue(false) }));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => (_req, _res, next) => next() }));
vi.mock("../../lib/validator/api.js", () => ({ default: vi.fn() }));
vi.mock("../../logger.js", () => ({ global: { debug: vi.fn() } }));
vi.mock("../../models/wireguard_peer.js", () => ({ default: { query: mocks.peerQuery } }));
vi.mock("../../schema/index.js", () => ({ getValidationSchema: vi.fn() }));

import "../../routes/nginx/wireguard.js";

const createPeerQuery = (peers) => {
	const filters = [];
	const query = Promise.resolve().then(() =>
		peers.filter((peer) => filters.every(([field, value]) => peer[field] === value)),
	);
	Object.assign(query, {
		orderBy: () => query,
		where: (field, value) => {
			filters.push([field, value]);
			return query;
		},
	});
	return query;
};

const peers = [
	{
		client_private_key: "owner-private-key",
		id: 1,
		is_deleted: 0,
		name: "owned peer",
		owner_user_id: 7,
		preshared_key: "owner-preshared-key",
		status: 2,
	},
	{
		client_private_key: "foreign-private-key",
		id: 2,
		is_deleted: 0,
		name: "foreign peer",
		owner_user_id: 8,
		preshared_key: "foreign-preshared-key",
		status: 2,
	},
];

const makeResponse = (access) => ({
	locals: { access },
	send: vi.fn(),
	status: vi.fn().mockReturnThis(),
});

describe("WireGuard status ownership", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.peerQuery.mockImplementation(() => createPeerQuery(peers));
		mocks.refreshStatuses.mockResolvedValue();
	});

	it("returns live status only for peers owned by a restricted caller", async () => {
		const access = {
			can: vi.fn().mockResolvedValue({ permission_visibility: "user" }),
			token: { getUserId: vi.fn().mockReturnValue(7) },
		};
		const res = makeResponse(access);

		await mocks.getStatusHandler({}, res);

		expect(access.can).toHaveBeenCalledWith("wireguard_peers:list");
		expect(mocks.refreshStatuses).toHaveBeenCalledWith(7);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.send).toHaveBeenCalledWith({
			peers: [{ id: 1, is_deleted: 0, name: "owned peer", owner_user_id: 7, status: 2 }],
		});
	});

	it("keeps all peer statuses available to callers with global visibility", async () => {
		const access = {
			can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
			token: { getUserId: vi.fn().mockReturnValue(7) },
		};
		const res = makeResponse(access);

		await mocks.getStatusHandler({}, res);

		expect(mocks.refreshStatuses).toHaveBeenCalledWith();
		expect(res.send).toHaveBeenCalledWith({
			peers: [
				{ id: 1, is_deleted: 0, name: "owned peer", owner_user_id: 7, status: 2 },
				{ id: 2, is_deleted: 0, name: "foreign peer", owner_user_id: 8, status: 2 },
			],
		});
	});
});
