import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getAll: vi.fn(),
	listHandler: null,
}));

vi.mock("express", () => ({
	default: {
		Router: () => ({
			route: (path) => {
				const route = {
					all: () => route,
					get: (handler) => {
						if (path === "/") {
							mocks.listHandler = handler;
						}
						return route;
					},
					options: () => route,
				};
				return route;
			},
		}),
	},
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { getAll: mocks.getAll } }));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => (_req, _res, next) => next() }));

import "../../routes/audit-log.js";

const createResponse = (access) => ({
	locals: { access },
	send: vi.fn(),
	status: vi.fn().mockReturnThis(),
});

describe("audit log date range route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("forwards a validated UTC creation range to the audit-log service", async () => {
		const access = { can: vi.fn().mockResolvedValue(undefined) };
		const res = createResponse(access);
		const created_after = "2026-07-12T08:00:00.000Z";
		const created_before = "2026-07-12T10:00:00.000Z";
		mocks.getAll.mockResolvedValue([]);

		await mocks.listHandler({ query: { created_after, created_before } }, res);

		expect(mocks.getAll).toHaveBeenCalledWith(access, null, "", { created_after, created_before });
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.send).toHaveBeenCalledWith([]);
	});

	it("keeps existing audit-log requests valid when no creation range is supplied", async () => {
		const access = { can: vi.fn().mockResolvedValue(undefined) };
		const res = createResponse(access);
		mocks.getAll.mockResolvedValue([]);

		await mocks.listHandler({ query: {} }, res);

		expect(mocks.getAll).toHaveBeenCalledWith(access, null, "", { created_after: null, created_before: null });
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("forwards a selected action to the audit-log service", async () => {
		const access = { can: vi.fn().mockResolvedValue(undefined) };
		const res = createResponse(access);
		mocks.getAll.mockResolvedValue([]);

		await mocks.listHandler({ query: { action: "deleted" } }, res);

		expect(mocks.getAll).toHaveBeenCalledWith(access, null, "", {
			action: "deleted",
			created_after: null,
			created_before: null,
		});
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("forwards a selected object type to the audit-log service", async () => {
		const access = { can: vi.fn().mockResolvedValue(undefined) };
		const res = createResponse(access);
		mocks.getAll.mockResolvedValue([]);

		await mocks.listHandler({ query: { object_type: "proxy-host" } }, res);

		expect(mocks.getAll).toHaveBeenCalledWith(access, null, "", {
			created_after: null,
			created_before: null,
			object_type: "proxy-host",
		});
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("rejects a creation range whose end precedes its start", async () => {
		const res = createResponse({ can: vi.fn().mockResolvedValue(undefined) });

		await expect(
			mocks.listHandler(
				{
					query: {
						created_after: "2026-07-12T10:00:00.000Z",
						created_before: "2026-07-12T08:00:00.000Z",
					},
				},
				res,
			),
		).rejects.toMatchObject({
			message: "created_before must not be earlier than created_after",
			name: "ValidationError",
		});

		expect(mocks.getAll).not.toHaveBeenCalled();
	});
});
