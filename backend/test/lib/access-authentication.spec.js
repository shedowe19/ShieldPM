import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ payload: null, user: null, query: vi.fn() }));
vi.mock("../../models/token.js", () => ({
	default: () => ({
		load: async () => state.payload,
		get: (key) => state.payload[key],
		hasScope: (scope) => state.payload.scope.includes(scope),
	}),
}));
vi.mock("../../models/user.js", () => ({ default: { query: state.query } }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../logger.js", () => ({ access: { error: vi.fn() } }));

import Access from "../../lib/access.js";

describe("Access.load authenticates accounts before exposing a token", () => {
	beforeEach(() => {
		state.payload = { attrs: { id: 7 }, scope: ["user"] };
		state.user = { id: 7, roles: [], permissions: {} };
		state.query.mockReset().mockImplementation(() => {
			const query = {
				where: vi.fn().mockReturnThis(),
				andWhere: vi.fn().mockReturnThis(),
				allowGraph: vi.fn().mockReturnThis(),
				withGraphFetched: vi.fn().mockReturnThis(),
				first: async () => state.user,
			};
			return query;
		});
	});

	it("rejects a pending second-factor JWT even if no later can() check is made", async () => {
		state.payload.scope = ["2fa_pending"];
		await expect(new Access("pending-token").load()).rejects.toThrow("Invalid token scope");
	});

	it("rejects a signed token whose user is no longer available", async () => {
		state.user = null;
		await expect(new Access("signed-token").load()).rejects.toThrow("User cannot be loaded");
	});

	it("loads an active account only once before subsequent permission checks", async () => {
		const access = new Access("signed-token");
		await expect(access.load()).resolves.toEqual(state.payload);
		await access.can("users:update", 7);
		expect(state.query).toHaveBeenCalledTimes(1);
	});

	it("preserves explicitly enabled internal access without a token", async () => {
		const access = new Access(null);
		await access.load(true);
		await expect(access.can("users:create", {})).resolves.toBe(true);
		expect(state.query).not.toHaveBeenCalled();
	});

	it("keeps ordinary certificate management separate from global client identity issuance", async () => {
		state.user.permissions = { visibility: "user", certificates: "manage" };
		const access = new Access("signed-token");
		await expect(access.can("certificates:create", {})).resolves.toBeTruthy();
		await expect(access.can("certificates:create-client", {})).rejects.toThrow("Permission Denied");
	});

	it("allows the shared CA client identity only with the current administrator role", async () => {
		state.user.roles = ["admin"];
		await expect(new Access("signed-token").can("certificates:create-client", {})).resolves.toBeTruthy();
	});

	it("does not trust an old administrator claim after the account role changes", async () => {
		state.payload.attrs.roles = ["admin"];
		state.user.permissions = { visibility: "all", certificates: "manage" };
		await expect(new Access("old-admin-token").can("certificates:create-client", {})).rejects.toThrow(
			"Permission Denied",
		);
	});
});
