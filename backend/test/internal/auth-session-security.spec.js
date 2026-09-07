import dayjs from "dayjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [], race: false, signed: vi.fn() }));
vi.mock("objection", () => ({
	transaction: async (_knex, callback) => {
		const before = structuredClone(state.rows);
		try {
			return await callback({});
		} catch (error) {
			state.rows = before;
			throw error;
		}
	},
}));
vi.mock("../../db.js", () => ({ default: () => ({ fn: { now: () => new Date().toISOString() } }) }));
vi.mock("../../lib/helpers.js", () => ({
	parseDatePeriod: (ttl) => dayjs().add(Number.parseInt(ttl, 10), ttl.endsWith("m") ? "minute" : "day"),
}));
vi.mock("../../models/token.js", () => ({ default: () => ({ create: state.signed }) }));
vi.mock("../../models/auth-session.js", () => ({
	default: {
		knex: () => ({}),
		hashToken: (token) => token,
		buildLookup: (token) => ({ token_hash: token }),
		normalizeScope: (scope) => (Array.isArray(scope) ? scope : [scope]),
		createFamilyId: () => "new-family",
		query: () => {
			const filters = [];
			let patch;
			const query = {
				findOne: (lookup) => ({
					withGraphFetched: async () => state.rows.find((row) => row.token_hash === lookup.token_hash),
				}),
				insertAndFetch: async (data) => {
					const row = { id: state.rows.length + 1, ...data };
					state.rows.push(row);
					return row;
				},
				patch: (data) => {
					patch = data;
					return query;
				},
				where: (key, value) => {
					filters.push((row) => row[key] === value);
					return query;
				},
				whereNull: (key) => {
					filters.push((row) => row[key] == null);
					return query;
				},
				// biome-ignore lint/suspicious/noThenProperty: Objection query builders are intentionally thenable.
				then: (resolve, reject) =>
					Promise.resolve()
						.then(() => {
							if (state.race && patch.rotated_at) return 0;
							const rows = state.rows.filter((row) => filters.every((filter) => filter(row)));
							for (const row of rows) Object.assign(row, patch);
							return rows.length;
						})
						.then(resolve, reject),
			};
			return query;
		},
	},
}));

import service from "../../internal/auth-session-service.js";

describe("refresh token security transactions", () => {
	beforeEach(() => {
		state.race = false;
		state.signed.mockReset().mockResolvedValue({ token: "access-token" });
		state.rows = [
			{
				id: 1,
				token_hash: "refresh-token",
				user_id: 7,
				family_id: "family",
				scope: ["user"],
				expires_at: dayjs().add(1, "day").toISOString(),
				user: { id: 7, roles: [], is_disabled: false, is_deleted: false },
			},
		];
	});

	it("commits family revocation before rejecting a replayed refresh token", async () => {
		state.rows[0].rotated_at = new Date().toISOString();
		state.rows.push({ id: 2, family_id: "family", token_hash: "replacement" });
		await expect(service.refreshTokenPair("refresh-token")).rejects.toThrow("replay detected");
		expect(state.rows.every((row) => row.revoked_reason === "refresh_token_replay_detected")).toBe(true);
		expect(state.signed).not.toHaveBeenCalled();
	});

	it("persists expiry revocation", async () => {
		state.rows[0].expires_at = dayjs().subtract(1, "day").toISOString();
		await expect(service.refreshTokenPair("refresh-token")).rejects.toThrow("expired");
		expect(state.rows[0].revoked_reason).toBe("expired_refresh_token");
	});

	it.each(["is_disabled", "is_deleted"])("rejects and revokes a refresh for a user with %s", async (flag) => {
		state.rows[0].user[flag] = true;
		await expect(service.refreshTokenPair("refresh-token")).rejects.toThrow("User cannot be loaded");
		expect(state.rows[0].revoked_reason).toBe("user_unavailable");
		expect(state.signed).not.toHaveBeenCalled();
	});

	it("revokes every session including the new one after losing a rotation race", async () => {
		state.race = true;
		await expect(service.refreshTokenPair("refresh-token")).rejects.toThrow("replay detected");
		expect(state.rows).toHaveLength(2);
		expect(state.rows.every((row) => row.revoked_reason === "refresh_token_rotation_race")).toBe(true);
		expect(state.signed).not.toHaveBeenCalled();
	});

	it("rotates a valid session and returns its successor", async () => {
		const pair = await service.refreshTokenPair("refresh-token");
		expect(pair.access_token).toBe("access-token");
		expect(pair.session.parent_session_id).toBe(1);
		expect(state.rows[0].replaced_by_session_id).toBe(pair.session.id);
		expect(state.rows[1].revoked_at).toBeUndefined();
	});
});
