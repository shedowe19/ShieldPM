import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ handlers: {}, record: null, audit: vi.fn(), start: vi.fn(), create: vi.fn() }));
vi.mock("express", () => ({
	default: {
		Router: () => {
			const router = { use: () => router };
			for (const method of ["get", "post", "put", "delete"])
				router[method] = (path, handler) => {
					state.handlers[`${method}:${path}`] = handler;
					return router;
				};
			return router;
		},
	},
}));
vi.mock("../../db.js", () => ({ default: () => ({}) }));
vi.mock("../../lib/config.js", () => ({ isDemoMode: () => false, getEncryptionKey: () => "0".repeat(64) }));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => () => {} }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: state.audit } }));
vi.mock("../../internal/tor.js", () => ({
	default: {
		getInfo: async () => ({ available: true }),
		start: state.start,
		create: state.create,
		stop: async () => true,
	},
}));

import TorOnion from "../../models/tor_onion.js";
import "../../routes/nginx/tor_onion.js";

const response = () => ({
	locals: {
		access: {
			can: async () => ({ permission_visibility: "all" }),
			token: { getUserId: () => 7 },
		},
	},
	status: vi.fn().mockReturnThis(),
	send: vi.fn(),
});

describe("public Tor management responses", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		state.start.mockResolvedValue(true);
		state.create.mockResolvedValue({ onionAddress: "test.onion" });
		state.record = Object.assign(new TorOnion(), {
			id: 3,
			name: "onion",
			owner_user_id: 7,
			private_key: "ED25519-V3:private",
			onion_address: `${"a".repeat(56)}.onion`,
		});
		vi.spyOn(TorOnion, "query").mockImplementation(() => {
			const query = {
				where: () => query,
				andWhere: () => query,
				findById: () => query,
				withGraphFetched: () => query,
				orderBy: async () => [state.record],
				first: async () => state.record,
				// biome-ignore lint/suspicious/noThenProperty: Objection queries are thenable.
				then: (resolve, reject) => Promise.resolve(state.record).then(resolve, reject),
			};
			return query;
		});
	});
	it.each(["get:/", "get:/:id", "post:/:id/start", "post:/:id/stop"])(
		"removes private identity keys from %s using real model serialization",
		async (handler) => {
			const res = response();
			await state.handlers[handler]({ params: { id: 3 } }, res);
			const json = JSON.stringify(res.send.mock.calls[0][0]);
			expect(json).not.toContain("private_key");
			expect(json).not.toContain("ED25519-V3");
			expect(json).toContain(state.record.onion_address);
			expect(state.record.private_key).toBe("ED25519-V3:private");
		},
	);
	it.each([true, false])(
		"does not audit a successful start after Tor refuses an existing=%s service",
		async (existing) => {
			if (!existing) state.record.private_key = null;
			state.start.mockResolvedValue(false);
			state.create.mockResolvedValue(null);
			const res = response();
			await expect(state.handlers["post:/:id/start"]({ params: { id: 3 } }, res)).rejects.toMatchObject({
				status: 400,
			});
			expect(state.audit).not.toHaveBeenCalled();
			expect(res.send).not.toHaveBeenCalled();
		},
	);
});
