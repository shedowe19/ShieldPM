import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ consumed: false }));
vi.mock("objection", () => ({
	// biome-ignore lint/complexity/noStaticOnlyClass: The production model extends this mocked Objection class.
	Model: class {
		static knex() {}
		static query() {}
	},
}));
vi.mock("../../db.js", () => ({ default: () => ({}) }));
vi.mock("../../models/now_helper.js", () => ({ default: () => "now" }));
vi.mock("bcryptjs", () => ({ default: { compare: async (code) => code === "correct" } }));

import BackupCode from "../../models/user-2fa-backup-codes.js";

describe("backup code atomic consumption", () => {
	beforeEach(() => {
		state.consumed = false;
		vi.spyOn(BackupCode, "query").mockImplementation(() => {
			let patch = false;
			let requireUnused = false;
			const query = {
				where: () => query,
				patch: () => {
					patch = true;
					return query;
				},
				whereNull: () => {
					requireUnused = true;
					return query;
				},
				// biome-ignore lint/suspicious/noThenProperty: Objection query builders are intentionally thenable.
				then: (resolve, reject) =>
					Promise.resolve()
						.then(() => {
							if (!patch) return state.consumed ? [] : [{ id: 1, user_id: 7, code_hash: "hashed" }];
							if (requireUnused && state.consumed) return 0;
							state.consumed = true;
							return 1;
						})
						.then(resolve, reject),
			};
			return query;
		});
	});

	it("only one concurrent verification can consume the same code", async () => {
		const results = await Promise.all([
			BackupCode.findAndConsume(7, "correct"),
			BackupCode.findAndConsume(7, "correct"),
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
		expect(results.filter((value) => value === null)).toHaveLength(1);
	});

	it("does not consume a nonmatching code", async () => {
		await expect(BackupCode.findAndConsume(7, "wrong")).resolves.toBeNull();
		expect(state.consumed).toBe(false);
	});
});
