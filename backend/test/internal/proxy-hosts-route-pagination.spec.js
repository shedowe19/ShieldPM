import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getAll: vi.fn(),
	listHandler: null,
	validator: vi.fn(),
}));

vi.mock("express", () => ({
	default: {
		Router: () => {
			const router = {
				route: (path) => {
					const route = {
						all: () => route,
						delete: () => route,
						get: (handler) => {
							if (path === "/") mocks.listHandler = handler;
							return route;
						},
						options: () => route,
						post: () => route,
						put: () => route,
					};
					return route;
				},
			};
			return router;
		},
	},
}));
vi.mock("../../internal/git-deploy.js", () => ({ default: {} }));
vi.mock("../../internal/proxy-host.js", () => ({ default: { getAll: mocks.getAll } }));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => () => undefined }));
vi.mock("../../lib/validator/api.js", () => ({ default: vi.fn() }));
vi.mock("../../lib/validator/index.js", () => ({ default: mocks.validator }));
vi.mock("../../schema/index.js", () => ({ getValidationSchema: vi.fn() }));

import "../../routes/nginx/proxy_hosts.js";

const createResponse = (access) => ({
	locals: { access },
	send: vi.fn(),
	status: vi.fn().mockReturnThis(),
});

describe("proxy host list route pagination contract", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getAll.mockResolvedValue({
			items: [{ id: 100 }],
			pagination: { limit: 100, page: 2, totalItems: 101, totalPages: 2 },
		});
	});

	it("passes validated page parameters through and returns the paginated response unchanged", async () => {
		mocks.validator.mockResolvedValue({ expand: ["owner"], limit: 100, page: 2, query: "service" });
		const access = {};
		const res = createResponse(access);

		await mocks.listHandler({ query: { limit: "100", page: "2", query: "service" } }, res);

		expect(mocks.getAll).toHaveBeenCalledWith(access, ["owner"], "service", { limit: 100, page: 2 });
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.send).toHaveBeenCalledWith({
			items: [{ id: 100 }],
			pagination: { limit: 100, page: 2, totalItems: 101, totalPages: 2 },
		});
	});

	it("does not enable pagination when absent query parameters are coerced to zero", async () => {
		const legacyRows = [{ id: 99 }];
		mocks.validator.mockResolvedValue({ expand: null, limit: 0, page: 0, query: null });
		mocks.getAll.mockResolvedValue(legacyRows);
		const access = {};
		const res = createResponse(access);

		await mocks.listHandler({ query: {} }, res);

		expect(mocks.getAll).toHaveBeenCalledWith(access, null, null, undefined);
		expect(res.send).toHaveBeenCalledWith(legacyRows);
	});

	it("preserves the array response for callers that do not request pagination", async () => {
		const legacyRows = [{ id: 99 }];
		mocks.validator.mockResolvedValue({ expand: null, limit: null, page: null, query: null });
		mocks.getAll.mockResolvedValue(legacyRows);
		const access = {};
		const res = createResponse(access);

		await mocks.listHandler({ query: {} }, res);

		expect(mocks.getAll).toHaveBeenCalledWith(access, null, null, undefined);
		expect(res.send).toHaveBeenCalledWith(legacyRows);
	});
});
