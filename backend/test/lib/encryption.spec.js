import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/config.js", () => ({
	getEncryptionKey: () => "0".repeat(64),
}));

const { decrypt, encrypt } = await import("../../lib/encryption.js");

describe("AES-256-GCM encryption", () => {
	it("round-trips plaintext with a 128-bit authentication tag", () => {
		const encrypted = encrypt("sensitive-value");
		const [, , authTag] = encrypted.split(":");

		expect(authTag).toHaveLength(32);
		expect(decrypt(encrypted)).toBe("sensitive-value");
	});

	it("rejects truncated GCM authentication tags", () => {
		const [iv, ciphertext, authTag] = encrypt("sensitive-value").split(":");
		const truncatedTag = authTag.slice(0, 24);

		expect(() => decrypt(`${iv}:${ciphertext}:${truncatedTag}`)).toThrow();
	});
});
