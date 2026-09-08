import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	handlers: {},
	host: {},
	filters: [],
	startTransaction: vi.fn(),
	deleteService: vi.fn(),
	remove: vi.fn(),
}));
vi.mock("express", () => ({
	default: {
		Router: () => {
			const router = { use: () => router };
			for (const method of ["get", "post", "put", "delete"])
				router[method] = (path, handler) => {
					mocks.handlers[`${method}:${path}`] = handler;
					return router;
				};
			return router;
		},
	},
}));
vi.mock("objection", () => ({ transaction: { start: mocks.startTransaction } }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/tor.js", () => ({ default: { delete: mocks.deleteService } }));
vi.mock("../../lib/config.js", () => ({ isDemoMode: () => false }));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => () => {} }));
vi.mock("../../lib/validator/api.js", () => ({ default: async (_schema, body) => ({ ...body }) }));
vi.mock("../../schema/index.js", () => ({ getValidationSchema: vi.fn() }));
vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: () => {
			const filters = [];
			const query = {
				where: (field, value) => {
					filters.push([field, value]);
					mocks.filters.push([field, value]);
					return query;
				},
				first: async () =>
					filters.every(([field, value]) => mocks.host[field] === value) ? mocks.host : undefined,
			};
			return query;
		},
	},
}));
vi.mock("../../models/tor_onion.js", () => ({
	default: {
		knex: vi.fn(),
		query: () => {
			const query = {
				where: () => query,
				first: async () => ({
					id: 3,
					name: "onion",
					owner_user_id: 1,
					$query: () => ({ delete: mocks.remove }),
				}),
			};
			return query;
		},
	},
}));

import "../../routes/nginx/tor_onion.js";

const response = (visibility = "user") => ({
	locals: {
		access: {
			can: vi.fn().mockResolvedValue({ permission_visibility: visibility }),
			token: { getUserId: () => 1 },
		},
	},
	status: vi.fn().mockReturnThis(),
	send: vi.fn(),
});

describe("Tor linked-host authorization and stop failures", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.filters.length = 0;
		mocks.host = { id: 8, owner_user_id: 2, is_deleted: 0 };
	});
	it("checks host ownership before creating an onion linked to somebody else's host", async () => {
		const res = response();
		const next = vi.fn();
		await mocks.handlers["post:/"]({ body: { name: "onion", proxy_host_id: 8, target_port: 80 } }, res, next);
		expect(res.locals.access.can).toHaveBeenCalledWith("proxy_hosts:update", 8);
		expect(mocks.filters).toContainEqual(["owner_user_id", 1]);
		expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
		expect(mocks.startTransaction).not.toHaveBeenCalled();
	});
	it("requires host update permission even if onion creation is allowed", async () => {
		const res = response();
		const next = vi.fn();
		res.locals.access.can.mockImplementation(async (operation) => {
			if (operation === "proxy_hosts:update") throw new Error("Forbidden host update");
			return { permission_visibility: "all" };
		});
		await mocks.handlers["post:/"]({ body: { proxy_host_id: 8 } }, res, next);
		expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Forbidden host update" }));
		expect(mocks.startTransaction).not.toHaveBeenCalled();
	});
	it("retains the service record when Tor cannot stop the detached service", async () => {
		mocks.deleteService.mockRejectedValue(new Error("Unable to stop onion service"));
		const next = vi.fn();
		await mocks.handlers["delete:/:id"]({ params: { id: 3 } }, response("all"), next);
		expect(mocks.deleteService).toHaveBeenCalledWith(3);
		expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Unable to stop onion service" }));
		expect(mocks.startTransaction).not.toHaveBeenCalled();
		expect(mocks.remove).not.toHaveBeenCalled();
	});
});
