import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/config.js", () => ({ getEncryptionKey: () => "02".repeat(32) }));

const keyId = (keyHex) => crypto.createHash("sha256").update(Buffer.from(keyHex, "hex")).digest("hex").slice(0, 16);

const envelope = (plaintext, keyHex, { legacy = false } = {}) => {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
	const ciphertext = cipher.update(plaintext, "utf8", "hex") + cipher.final("hex");
	const tag = cipher.getAuthTag().toString("hex");
	return legacy
		? `${iv.toString("hex")}:${ciphertext}:${tag}`
		: `v2:${keyId(keyHex)}:${iv.toString("hex")}:${ciphertext}:${tag}`;
};

describe("encryption key rotation", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it("reads legacy and previous-key ciphertext and re-encrypts it with the active key", async () => {
		vi.stubEnv("SHIELDPM_ENCRYPTION_KEY", "02".repeat(32));
		vi.stubEnv("SHIELDPM_ENCRYPTION_KEY_PREVIOUS", "01".repeat(32));
		vi.resetModules();

		const { decrypt, encrypt, needsRotation, getActiveKeyId } = await import("../../lib/encryption.js");
		const oldKey = "01".repeat(32);

		expect(decrypt(envelope("legacy secret", oldKey, { legacy: true }))).toBe("legacy secret");
		expect(decrypt(envelope("v2 secret", oldKey))).toBe("v2 secret");
		expect(needsRotation(envelope("legacy secret", oldKey, { legacy: true }))).toBe(true);
		expect(needsRotation(envelope("v2 secret", oldKey))).toBe(true);

		const rotated = encrypt("legacy secret");
		expect(needsRotation(rotated)).toBe(false);
		expect(decrypt(rotated)).toBe("legacy secret");
		expect(rotated.split(":")[1]).toBe(getActiveKeyId());
	});

	it("does not read previous-key ciphertext after the previous key is removed", async () => {
		vi.stubEnv("SHIELDPM_ENCRYPTION_KEY", "02".repeat(32));
		vi.stubEnv("SHIELDPM_ENCRYPTION_KEY_PREVIOUS", "");
		vi.resetModules();

		const { decrypt } = await import("../../lib/encryption.js");
		expect(() => decrypt(envelope("old secret", "01".repeat(32), { legacy: true }))).toThrow();
		expect(() => decrypt(envelope("old secret", "01".repeat(32)))).toThrow(/Unknown encryption key id/);
	});
});
