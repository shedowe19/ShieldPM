import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ keys: null }));
vi.mock("../../lib/config.js", () => ({
	getPrivateKey: () => state.keys.privateKey,
	getPublicKey: () => state.keys.publicKey,
}));
vi.mock("../../models/user.js", () => ({ default: {} }));
vi.mock("../../models/auth.js", () => ({ default: {} }));
vi.mock("../../internal/auth-session-service.js", () => ({ default: {} }));

import internalToken from "../../internal/token.js";

const claimsOf = (token) => jwt.decode(token);

describe("impersonation token claims", () => {
	beforeAll(() => {
		state.keys = crypto.generateKeyPairSync("rsa", {
			modulusLength: 2048,
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
			publicKeyEncoding: { type: "spki", format: "pem" },
		});
	});

	it("keeps sub on the target and records the administrator in act.sub", async () => {
		const result = await internalToken.getTokenFromUser(
			{ id: 7, name: "Target", email: "target@example.test", roles: [] },
			{ actorUserId: 1, sessionId: "admin-family" },
		);
		const claims = claimsOf(result.token);

		expect(claims.attrs).toEqual({ id: 7 });
		expect(claims.sub).toBe(7);
		expect(claims.act).toEqual({ sub: 1 });
		expect(claims.sid).toBe("admin-family");
		expect(claims.scope).toEqual(["user"]);
		expect(claims.jti).toEqual(expect.any(String));
		expect(claims.jti.length).toBeGreaterThan(0);
	});

	it("does not add act or sid to an ordinary user token", async () => {
		const result = await internalToken.getTokenFromUser({ id: 8, roles: [] });
		const claims = claimsOf(result.token);

		expect(claims.attrs).toEqual({ id: 8 });
		expect(claims.sub).toBe(8);
		expect(claims.act).toBeUndefined();
		expect(claims.sid).toBeUndefined();
		expect(claims.jti).toEqual(expect.any(String));
	});

	it("issues a unique jti for every token", async () => {
		const first = claimsOf((await internalToken.getTokenFromUser({ id: 7, roles: [] })).token);
		const second = claimsOf((await internalToken.getTokenFromUser({ id: 7, roles: [] })).token);

		expect(first.jti).not.toBe(second.jti);
	});
});
