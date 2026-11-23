import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/config.js", () => ({ getEncryptionKey: () => "01".repeat(32) }));

import { decrypt, encrypt, getActiveKeyId } from "../../lib/encryption.js";

describe("authenticated encryption envelope validation", () => {
	it.each(["", "Protected secret ??", "x".repeat(4096)])("round-trips supported plaintext", (plaintext) => {
		expect(decrypt(encrypt(plaintext))).toBe(plaintext);
	});

	it("uses a key-versioned envelope", () => {
		const parts = encrypt("Protected secret").split(":");
		expect(parts).toHaveLength(5);
		expect(parts[0]).toBe("v2");
		expect(parts[1]).toBe(getActiveKeyId());
	});

	it.each([2, 3, 4])("rejects non-hex suffixes on envelope component %i", (component) => {
		const parts = encrypt("Protected secret").split(":");
		parts[component] += "zz";
		expect(() => decrypt(parts.join(":"))).toThrow();
	});

	it.each([8, 24, 26, 28, 30])("rejects a truncated authentication tag of %i hex characters", (length) => {
		const parts = encrypt("Protected secret").split(":");
		parts[4] = parts[4].slice(0, length);
		expect(() => decrypt(parts.join(":"))).toThrow();
	});

	it.each([2, 3, 4])("rejects tampering with envelope component %i", (component) => {
		const parts = encrypt("Protected secret").split(":");
		parts[component] = `${parts[component][0] === "a" ? "b" : "a"}${parts[component].slice(1)}`;
		expect(() => decrypt(parts.join(":"))).toThrow();
	});

	it("rejects an unknown key id instead of guessing a key", () => {
		const parts = encrypt("Protected secret").split(":");
		parts[1] = "f".repeat(16);
		expect(() => decrypt(parts.join(":"))).toThrow(/Unknown encryption key id/);
	});

	it("rejects the unsupported number of envelope components", () => {
		expect(() => decrypt("aa:bb")).toThrow(/Invalid encrypted text format/);
		expect(() => decrypt("v2:aa:bb:cc:dd:ee")).toThrow(/Invalid encrypted text format/);
	});
});
