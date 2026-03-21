import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

// We test the pure helpers from constants.js directly
import { DEFAULT_AVATAR, detectAvatarFileType, getGravatarUrl, omissions } from "../../modules/user/constants.js";

describe("user module – constants & helpers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── omissions ───────────────────────────────────────────────────────

	describe("omissions", () => {
		it("should return an array containing is_deleted", () => {
			const result = omissions();
			expect(Array.isArray(result)).toBe(true);
			expect(result).toContain("is_deleted");
		});

		it("should include permission sub-fields", () => {
			const result = omissions();
			expect(result).toContain("permissions.id");
			expect(result).toContain("permissions.user_id");
		});
	});

	// ── getGravatarUrl ──────────────────────────────────────────────────

	describe("getGravatarUrl", () => {
		it("should return a gravatar URL with md5 hash", () => {
			const url = getGravatarUrl("test@example.com");
			const expectedHash = crypto.createHash("md5").update("test@example.com").digest("hex");
			expect(url).toBe(`https://www.gravatar.com/avatar/${expectedHash}?d=mm`);
		});

		it("should normalize email case", () => {
			const url1 = getGravatarUrl("Test@Example.COM");
			const url2 = getGravatarUrl("test@example.com");
			expect(url1).toBe(url2);
		});

		it("should trim whitespace", () => {
			const url1 = getGravatarUrl("  test@example.com  ");
			const url2 = getGravatarUrl("test@example.com");
			expect(url1).toBe(url2);
		});
	});

	// ── DEFAULT_AVATAR ──────────────────────────────────────────────────

	describe("DEFAULT_AVATAR", () => {
		it("should be a gravatar URL for admin@example.com", () => {
			expect(DEFAULT_AVATAR).toContain("gravatar.com/avatar/");
			expect(DEFAULT_AVATAR).toBe(getGravatarUrl("admin@example.com"));
		});
	});

	// ── detectAvatarFileType ────────────────────────────────────────────

	describe("detectAvatarFileType", () => {
		it("should detect PNG files", () => {
			const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
			const result = detectAvatarFileType(pngHeader);
			expect(result).not.toBeNull();
			expect(result.mimeType).toBe("image/png");
			expect(result.extension).toBe(".png");
		});

		it("should detect JPEG files", () => {
			const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
			const result = detectAvatarFileType(jpegHeader);
			expect(result).not.toBeNull();
			expect(result.mimeType).toBe("image/jpeg");
			expect(result.extension).toBe(".jpg");
		});

		it("should detect GIF87a files", () => {
			const gifHeader = Buffer.from("GIF87a", "ascii");
			const result = detectAvatarFileType(gifHeader);
			expect(result).not.toBeNull();
			expect(result.mimeType).toBe("image/gif");
		});

		it("should detect GIF89a files", () => {
			const gifHeader = Buffer.from("GIF89a", "ascii");
			const result = detectAvatarFileType(gifHeader);
			expect(result).not.toBeNull();
			expect(result.mimeType).toBe("image/gif");
		});

		it("should detect WebP files", () => {
			const webpHeader = Buffer.alloc(12);
			webpHeader.write("RIFF", 0, "ascii");
			webpHeader.writeUInt32LE(0, 4); // size placeholder
			webpHeader.write("WEBP", 8, "ascii");
			const result = detectAvatarFileType(webpHeader);
			expect(result).not.toBeNull();
			expect(result.mimeType).toBe("image/webp");
		});

		it("should return null for unknown file types", () => {
			const unknown = Buffer.from([0x00, 0x01, 0x02, 0x03]);
			expect(detectAvatarFileType(unknown)).toBeNull();
		});

		it("should return null for empty buffer", () => {
			expect(detectAvatarFileType(Buffer.alloc(0))).toBeNull();
		});

		it("should return null for non-buffer input", () => {
			expect(detectAvatarFileType("not a buffer")).toBeNull();
		});

		it("should return null for null input", () => {
			expect(detectAvatarFileType(null)).toBeNull();
		});
	});
});
