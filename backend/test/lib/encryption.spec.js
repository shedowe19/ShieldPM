import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";

// Mock config.js to provide a stable encryption key
const testKey = crypto.randomBytes(32).toString("hex");
vi.mock("../../lib/config.js", () => ({
	getEncryptionKey: () => testKey,
}));

const { encrypt, decrypt } = await import("../../lib/encryption.js");

describe("encryption", () => {
	describe("encrypt", () => {
		it("returns a string with 3 colon-separated parts", () => {
			const result = encrypt("hello");
			const parts = result.split(":");
			expect(parts).toHaveLength(3);
		});

		it("produces different ciphertext for same plaintext (random IV)", () => {
			const a = encrypt("same");
			const b = encrypt("same");
			expect(a).not.toBe(b);
		});

		it("all parts are hex strings", () => {
			const result = encrypt("test");
			for (const part of result.split(":")) {
				expect(part).toMatch(/^[0-9a-f]+$/);
			}
		});
	});

	describe("decrypt", () => {
		it("round-trips correctly", () => {
			const plaintext = "Hello, World! 🔐";
			const encrypted = encrypt(plaintext);
			expect(decrypt(encrypted)).toBe(plaintext);
		});

		it("round-trips empty string", () => {
			const encrypted = encrypt("");
			expect(decrypt(encrypted)).toBe("");
		});

		it("throws on invalid format (not 3 parts)", () => {
			expect(() => decrypt("abc:def")).toThrow("Invalid encrypted text format");
		});

		it("throws on tampered ciphertext", () => {
			const encrypted = encrypt("data");
			const parts = encrypted.split(":");
			// flip a byte in the encrypted text
			parts[1] = `ff${parts[1].slice(2)}`;
			expect(() => decrypt(parts.join(":"))).toThrow();
		});

		it("throws on tampered auth tag", () => {
			const encrypted = encrypt("data");
			const parts = encrypted.split(":");
			parts[2] = "00".repeat(16);
			expect(() => decrypt(parts.join(":"))).toThrow();
		});
	});
});
