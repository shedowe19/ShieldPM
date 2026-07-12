import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	addAuditLog: vi.fn(),
	deleteById: vi.fn(),
	providerQuery: vi.fn(),
	providers: [],
	triggerAutoPush: vi.fn(),
}));

vi.mock("../../models/ddns_provider.js", () => ({ default: { query: mocks.providerQuery } }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: mocks.addAuditLog } }));
vi.mock("../../internal/ddns.js", () => ({ default: {} }));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: mocks.triggerAutoPush } }));

import internalDdnsProvider from "../../internal/ddns-provider.js";

const makeAccess = (visibility) => ({
	can: vi.fn().mockResolvedValue({ permission_visibility: visibility }),
	token: { getUserId: vi.fn().mockReturnValue(7) },
});

describe("DDNS provider deletion access", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.providers = [
			{ id: 1, name: "owned-provider", owner_user_id: 7 },
			{ id: 2, name: "foreign-provider", owner_user_id: 8 },
		];
		mocks.providerQuery.mockImplementation(() => {
			const filters = [];
			return {
				deleteById: async (id) => {
					mocks.deleteById(id);
					mocks.providers = mocks.providers.filter((provider) => provider.id !== id);
				},
				findById: async (id) => mocks.providers.find((provider) => provider.id === id),
				first: async () =>
					mocks.providers.find((provider) => filters.every(([field, value]) => provider[field] === value)),
				where(field, value) {
					filters.push([field, value]);
					return this;
				},
			};
		});
		mocks.addAuditLog.mockResolvedValue();
	});

	it("does not delete a provider owned by another user", async () => {
		const access = makeAccess("user");

		await expect(internalDdnsProvider.delete(access, { id: 2 })).rejects.toThrow("Not Found - 2");

		expect(mocks.providers.map((provider) => provider.id)).toEqual([1, 2]);
		expect(mocks.deleteById).not.toHaveBeenCalled();
		expect(mocks.addAuditLog).not.toHaveBeenCalled();
	});

	it("deletes an owned provider after authorizing the request", async () => {
		const access = makeAccess("user");

		await expect(internalDdnsProvider.delete(access, { id: 1 })).resolves.toBe(true);

		expect(mocks.providers.map((provider) => provider.id)).toEqual([2]);
		expect(access.can).toHaveBeenCalledWith("ddns_providers:delete", { id: 1 });
		expect(mocks.addAuditLog).toHaveBeenCalledWith(
			access,
			expect.objectContaining({ action: "deleted", object_id: 1, object_type: "ddns-provider" }),
		);
	});

	it("allows administrators with all-object visibility to delete a foreign provider", async () => {
		const access = makeAccess("all");

		await expect(internalDdnsProvider.delete(access, { id: 2 })).resolves.toBe(true);

		expect(mocks.providers.map((provider) => provider.id)).toEqual([1]);
	});
});
