import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/config.js", () => ({ getEncryptionKey: () => "01".repeat(32) }));

import { decrypt, encrypt } from "../../lib/encryption.js";

describe("authenticated encryption envelope validation", () => {
	it.each(["", "Protected secret 🔐", "x".repeat(4096)])("round-trips supported plaintext", (plaintext) => {
		expect(decrypt(encrypt(plaintext))).toBe(plaintext);
	});

	it.each([0, 1, 2])("rejects non-hex suffixes on envelope component %i", (component) => {
		const parts = encrypt("Protected secret").split(":");
		parts[component] += "zz";
		expect(() => decrypt(parts.join(":"))).toThrow();
	});

	it.each([8, 24, 26, 28, 30])("rejects a truncated authentication tag of %i hex characters", (length) => {
		const parts = encrypt("Protected secret").split(":");
		parts[2] = parts[2].slice(0, length);
		expect(() => decrypt(parts.join(":"))).toThrow();
	});

	it.each([0, 1, 2])("rejects tampering with envelope component %i", (component) => {
		const parts = encrypt("Protected secret").split(":");
		parts[component] = `${parts[component][0] === "a" ? "b" : "a"}${parts[component].slice(1)}`;
		expect(() => decrypt(parts.join(":"))).toThrow();
	});
});
