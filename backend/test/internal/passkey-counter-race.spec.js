import crypto from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, afterVerification: null }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({ isSqlite: () => true, getEncryptionKey: () => "01".repeat(32) }));
vi.mock("@simplewebauthn/server", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		verifyAuthenticationResponse: async (options) => {
			// Keep real parsing, RP/origin checks, ES256 verification and counter
			// validation; only control the asynchronous interleaving afterwards.
			const verified = await actual.verifyAuthenticationResponse(options);
			await state.afterVerification?.(verified);
			return verified;
		},
	};
});

import service from "../../internal/2fa-service.js";

const rpID = "shield.example.test";
const origin = `https://${rpID}`;
const req = { headers: { origin }, protocol: "https", hostname: rpID };
const credentialId = Buffer.from("test-passkey").toString("base64url");
const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = publicKey.export({ format: "jwk" });
const coseKey = isoCBOR.encode(
	new Map([
		[1, 2],
		[3, -7],
		[-1, 1],
		[-2, new Uint8Array(Buffer.from(jwk.x, "base64url"))],
		[-3, new Uint8Array(Buffer.from(jwk.y, "base64url"))],
	]),
);

const assertion = (challenge, counter) => {
	const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin }));
	const authenticatorData = Buffer.alloc(37);
	crypto.createHash("sha256").update(rpID).digest().copy(authenticatorData);
	authenticatorData[32] = 0x05; // User present and user verified.
	authenticatorData.writeUInt32BE(counter, 33);
	const signature = crypto.sign(
		"sha256",
		Buffer.concat([authenticatorData, crypto.createHash("sha256").update(clientData).digest()]),
		privateKey,
	);
	return {
		id: credentialId,
		rawId: credentialId,
		type: "public-key",
		response: {
			clientDataJSON: clientData.toString("base64url"),
			authenticatorData: authenticatorData.toString("base64url"),
			signature: signature.toString("base64url"),
		},
	};
};

const challenge = async (id) => {
	const value = crypto.randomBytes(32).toString("base64url");
	await state.db("user_2fa").insert({
		user_id: 7,
		type: "passkey_auth_challenge",
		secret: id,
		is_verified: 0,
		meta: JSON.stringify({ challenge: value, expiresAt: Date.now() + 300000 }),
	});
	return value;
};

describe("passkey credential updates after asynchronous verification", () => {
	beforeAll(async () => {
		await state.db.schema.createTable("user_2fa", (t) => {
			t.increments("id");
			t.integer("user_id");
			t.string("type");
			t.string("secret");
			t.text("public_key");
			t.integer("counter").defaultTo(0);
			t.text("meta");
			t.integer("is_verified").defaultTo(0);
			t.integer("is_deleted").defaultTo(0);
			t.string("modified_on");
		});
	});
	beforeEach(async () => {
		state.afterVerification = null;
		await state.db("user_2fa").delete();
		await state.db("user_2fa").insert({
			id: 1,
			user_id: 7,
			type: "passkey",
			secret: credentialId,
			public_key: Buffer.from(coseKey).toString("base64"),
			is_verified: 1,
		});
	});
	afterAll(async () => state.db.destroy());

	it("cannot lower a counter committed by a concurrent valid assertion", async () => {
		const first = await challenge("first");
		const second = await challenge("second");
		state.afterVerification = async (verified) => {
			if (verified.authenticationInfo.newCounter === 1) {
				await expect(
					service.completePasskeyAuthentication(7, "second", assertion(second, 2), req),
				).resolves.toBe(true);
			}
		};
		await expect(service.completePasskeyAuthentication(7, "first", assertion(first, 1), req)).rejects.toThrow(
			"changed during authentication",
		);
		expect((await state.db("user_2fa").where({ id: 1 }).first()).counter).toBe(2);
	});

	it.each(["is_deleted", "is_verified"])(
		"rejects a credential whose %s changed during verification",
		async (flag) => {
			const value = await challenge("pending");
			state.afterVerification = () =>
				state
					.db("user_2fa")
					.where({ id: 1 })
					.update({ [flag]: flag === "is_deleted" ? 1 : 0 });
			await expect(service.completePasskeyAuthentication(7, "pending", assertion(value, 1), req)).rejects.toThrow(
				"changed during authentication",
			);
			expect((await state.db("user_2fa").where({ id: 1 }).first()).counter).toBe(0);
		},
	);

	it("keeps authenticators without a signature counter usable across separate challenges", async () => {
		for (const id of ["first", "second"]) {
			const value = await challenge(id);
			await expect(service.completePasskeyAuthentication(7, id, assertion(value, 0), req)).resolves.toBe(true);
		}
		expect((await state.db("user_2fa").where({ id: 1 }).first()).counter).toBe(0);
	});
});
