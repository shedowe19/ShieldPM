import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
	const trx = { fn: { now: () => "2026-11-23T00:00:00.000Z" } };
	return {
		trx,
		userPatch: vi.fn(async () => ({ id: 7 })),
		sessionQuery: vi.fn(),
		sessionWhere: vi.fn(),
		sessionWhereNull: vi.fn(),
		sessionPatch: vi.fn(async () => 2),
		transaction: vi.fn(async (callback) => callback(trx)),
		committed: false,
		audit: vi.fn(),
	};
});
vi.mock("../../models/user.js", () => ({
	default: {
		knex: () => ({ client: { dialect: "sqlite3" } }),
		transaction: (callback) => {
			state.committed = false;
			return state.transaction(callback).then((result) => {
				state.committed = true;
				return result;
			});
		},
		query: (trx) => ({
			patchAndFetchById: (id, data) => state.userPatch(trx, id, data),
			findById: vi.fn(),
			insertAndFetch: vi.fn(),
		}),
	},
}));
vi.mock("../../models/auth-session.js", () => ({
	default: {
		query: (trx) => {
			state.sessionQuery(trx);
			const query = {
				where: (...args) => {
					state.sessionWhere(...args);
					return query;
				},
				whereNull: (...args) => {
					state.sessionWhereNull(...args);
					return query;
				},
				patch: (data) => state.sessionPatch(trx, data),
			};
			return query;
		},
	},
}));
vi.mock("../../models/setting.js", () => ({
	default: {
		query: (trx) => ({
			findById: () => ({ forUpdate: async () => ({ id: "default-site", trx }) }),
		}),
	},
}));
vi.mock("../../models/auth.js", () => ({ default: {} }));
vi.mock("../../models/user_permission.js", () => ({ default: { query: () => ({ insert: vi.fn() }) } }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: state.audit } }));
vi.mock("../../internal/token.js", () => ({ default: {} }));
vi.mock("../../lib/utils.js", () => ({ default: {} }));

import service from "../../internal/user.js";

const user = {
	id: 7,
	roles: [],
	is_disabled: 0,
	email: "user@example.com",
	avatar_type: "gravatar",
	avatar_value: "",
};
const access = () => ({
	token: { getUserId: () => 1 },
	can: vi.fn(async () => {}),
});

describe("disabling an account revokes its refresh sessions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(service, "get").mockResolvedValue({ ...user });
	});
	afterEach(() => vi.restoreAllMocks());

	it("revokes every active session in the same transaction as is_disabled", async () => {
		await service.update(access(), { id: 7, is_disabled: true });

		expect(state.transaction).toHaveBeenCalledOnce();
		expect(state.userPatch).toHaveBeenCalledWith(state.trx, 7, expect.objectContaining({ is_disabled: 1 }));
		expect(state.sessionWhere).toHaveBeenCalledWith("user_id", 7);
		expect(state.sessionWhereNull).toHaveBeenCalledWith("revoked_at");
		expect(state.sessionPatch).toHaveBeenCalledWith(state.trx, {
			revoked_at: "2026-11-23T00:00:00.000Z",
			revoked_reason: "account_disabled",
		});
		expect(state.committed).toBe(true);
	});

	it("leaves the account change uncommitted when session revocation fails", async () => {
		state.sessionPatch.mockRejectedValueOnce(new Error("session revoke failed"));
		await expect(service.update(access(), { id: 7, is_disabled: true })).rejects.toThrow("session revoke failed");
		expect(state.userPatch).toHaveBeenCalledOnce();
		expect(state.committed).toBe(false);
	});

	it("keeps the revocation in the email-claim transaction when the email also changes", async () => {
		vi.spyOn(service, "isEmailAvailable").mockResolvedValue(true);
		await service.update(access(), { id: 7, email: "new@example.com", is_disabled: true });

		expect(state.transaction).toHaveBeenCalledOnce();
		expect(state.userPatch).toHaveBeenCalledWith(
			state.trx,
			7,
			expect.objectContaining({ email: "new@example.com", is_disabled: 1 }),
		);
		expect(state.sessionPatch).toHaveBeenCalledWith(
			state.trx,
			expect.objectContaining({ revoked_reason: "account_disabled" }),
		);
	});

	it("does not revive sessions when the account is re-enabled", async () => {
		service.get.mockResolvedValue({ ...user, is_disabled: 1 });
		await service.update(access(), { id: 7, is_disabled: false });

		expect(state.userPatch).toHaveBeenCalledWith(undefined, 7, expect.objectContaining({ is_disabled: 0 }));
		expect(state.sessionQuery).not.toHaveBeenCalled();
		expect(state.sessionPatch).not.toHaveBeenCalled();
	});
});
