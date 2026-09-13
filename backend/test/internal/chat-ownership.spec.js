import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ handlers: {}, query: vi.fn(), reload: vi.fn(), stop: vi.fn(), mutate: vi.fn() }));
vi.mock("express", () => ({
	default: {
		Router: () => {
			const router = {};
			for (const method of ["get", "post", "put", "delete"])
				router[method] = (path, ...handlers) => {
					mocks.handlers[`${method}:${path}`] = handlers.at(-1);
					return router;
				};
			return router;
		},
	},
}));
vi.mock("../../internal/chat.js", () => ({ default: { reload: mocks.reload, stopBot: mocks.stop } }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: (value) => value }));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => () => {} }));
vi.mock("../../lib/validator/api.js", () => ({ default: async (_schema, data) => data }));
vi.mock("../../schema/index.js", () => ({ getValidationSchema: () => ({}) }));
vi.mock("../../models/chat_integration.js", () => ({ default: { query: mocks.query } }));

import "../../routes/chat.js";

describe("ChatOps integration ownership", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	it.each(["put", "delete"])("does not let user %s another owner's bot", async (method) => {
		mocks.query.mockImplementation(() => {
			const filters = [];
			const query = {
				findById: () => query,
				where: (field, value) => {
					filters.push([field, value]);
					return query;
				},
				// biome-ignore lint/suspicious/noThenProperty: Objection query builders are intentionally thenable.
				then: (resolve) =>
					Promise.resolve(
						filters.some(([field, value]) => field === "user_id" && value === 7)
							? undefined
							: { id: 2, user_id: 8 },
					).then(resolve),
				patchAndFetchById: mocks.mutate,
				deleteById: mocks.mutate,
			};
			return query;
		});
		const access = { can: vi.fn().mockResolvedValue(true), token: { getUserId: () => 7 } };
		await expect(
			mocks.handlers[`${method}:/:id`]({ params: { id: "2" }, body: {} }, { locals: { access } }),
		).rejects.toThrow("Not Found");
		expect(mocks.mutate).not.toHaveBeenCalled();
		expect(mocks.reload).not.toHaveBeenCalled();
		expect(mocks.stop).not.toHaveBeenCalled();
	});
});
