import { beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn(), handler: null }));
vi.mock("express", () => ({
	default: {
		Router: () => ({
			route: (path) => {
				const route = {};
				for (const method of ["options", "all", "get", "post", "put", "delete"])
					route[method] = (handler) => {
						if (path === "/:id" && method === "put") mocks.handler = handler;
						return route;
					};
				return route;
			},
		}),
	},
}));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => () => {} }));
vi.mock("../../internal/ddns-provider.js", () => ({ default: { update: mocks.update } }));

import { getCompiledSchema } from "../../schema/index.js";
import "../../routes/nginx/ddns_providers.js";

describe("DDNS update route schema", () => {
	beforeAll(async () => {
		await getCompiledSchema();
	});
	it("validates an update against the actual registered Swagger path", async () => {
		mocks.update.mockResolvedValue({ id: 7, name: "changed" });
		const access = { can: vi.fn().mockResolvedValue(true) };
		const res = { locals: { access }, status: vi.fn().mockReturnThis(), send: vi.fn() };
		await mocks.handler({ params: { id: "7" }, body: { name: "changed", enabled: 0 } }, res);
		expect(mocks.update).toHaveBeenCalledWith(access, { id: 7, name: "changed", enabled: 0 });
	});
	it("rejects additional input fields before updating a provider", async () => {
		mocks.update.mockClear();
		await expect(
			mocks.handler({ params: { id: "7" }, body: { owner_user_id: 99 } }, { locals: { access: {} } }),
		).rejects.toMatchObject({ status: 400 });
		expect(mocks.update).not.toHaveBeenCalled();
	});
});
