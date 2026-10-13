import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ users: [], auth: undefined, createToken: vi.fn() }));
vi.mock("../../models/user.js", () => ({
	default: {
		query: () => ({
			whereRaw: vi.fn().mockReturnThis(),
			andWhere: vi.fn().mockReturnThis(),
			limit: async () => state.users,
		}),
	},
}));
vi.mock("../../models/auth.js", () => ({
	default: {
		query: () => ({ where: vi.fn().mockReturnThis(), first: async () => state.auth }),
	},
}));
vi.mock("../../models/token.js", () => ({ default: () => ({ create: state.createToken }) }));
vi.mock("../../internal/auth-session-service.js", () => ({ default: {} }));

import tokens from "../../internal/token.js";

const login = () => tokens.getTokenFromEmail({ identity: "missing@example.test", secret: "wrong-password" });

describe("password login dummy work uses the real service hash", () => {
	beforeEach(() => {
		state.users = [];
		state.auth = undefined;
		state.createToken.mockReset();
	});
	afterEach(() => vi.restoreAllMocks());

	it("performs actual bcrypt work with a valid cost-13 hash for a missing user", async () => {
		const compare = vi.spyOn(bcrypt, "compare");
		await expect(login()).rejects.toMatchObject({ name: "AuthError", message: "Invalid email or password" });
		expect(compare).toHaveBeenCalledOnce();
		const [password, hash] = compare.mock.calls[0];
		expect(password).toBe("wrong-password");
		expect(hash).toMatch(/^\$2[ab]\$13\$[./A-Za-z0-9]{53}$/);
		expect(bcrypt.getRounds(hash)).toBe(13);
		await expect(compare.mock.results[0].value).resolves.toBe(false);
		expect(state.createToken).not.toHaveBeenCalled();
	});

	it.each([
		["missing", []],
		["disabled", [{ id: 7, is_disabled: 1 }]],
		["ambiguous", [{ id: 7 }, { id: 8 }]],
		["missing password", [{ id: 7, is_disabled: 0 }]],
	])("awaits dummy work before rejecting a %s account", async (_reason, users) => {
		state.users = users;
		const work = Promise.withResolvers();
		const compare = vi.spyOn(bcrypt, "compare").mockReturnValue(work.promise);
		let settled = false;
		const attempt = login().finally(() => {
			settled = true;
		});
		const rejection = expect(attempt).rejects.toMatchObject({
			name: "AuthError",
			message: "Invalid email or password",
		});
		await vi.waitFor(() => expect(compare).toHaveBeenCalledOnce());
		expect(settled).toBe(false);
		work.resolve(false);
		await rejection;
		expect(settled).toBe(true);
		expect(bcrypt.getRounds(compare.mock.calls[0][1])).toBe(13);
		expect(state.createToken).not.toHaveBeenCalled();
	});
});
