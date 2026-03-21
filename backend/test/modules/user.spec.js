import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

// ── Mocks for user mutations/reads tests ───────────────────────────────────

const mockUserRecord = {
	id: 1,
	name: "Alice",
	email: "alice@example.com",
	nickname: "alice",
	avatar: "",
	avatar_type: "gravatar",
	avatar_value: "",
	roles: ["user"],
	is_deleted: 0,
};

const mockQueryBuilder = () => {
	const qb = {
		where: vi.fn(() => qb),
		andWhere: vi.fn(() => qb),
		first: vi.fn(() => Promise.resolve(mockUserRecord)),
		findById: vi.fn(() => Promise.resolve(mockUserRecord)),
		allowGraph: vi.fn(() => qb),
		withGraphFetched: vi.fn(() => qb),
		groupBy: vi.fn(() => qb),
		orderBy: vi.fn(() => qb),
		count: vi.fn(() => qb),
		insertAndFetch: vi.fn((data) => Promise.resolve({ id: 99, ...data })),
		patchAndFetchById: vi.fn((id, data) => Promise.resolve({ ...mockUserRecord, ...data, id })),
		patch: vi.fn(() => Promise.resolve(1)),
		insert: vi.fn((data) => Promise.resolve({ id: 100, ...data })),
		orWhere: vi.fn(() => qb),
		// biome-ignore lint/suspicious/noThenProperty: mock query builder needs .then
		then: vi.fn((cb) => Promise.resolve(mockUserRecord).then(cb)),
	};
	return qb;
};

vi.mock("../../models/user.js", () => ({
	default: {
		query: vi.fn(() => mockQueryBuilder()),
		transaction: vi.fn(async (cb) => cb({})),
	},
}));

vi.mock("../../models/auth.js", () => ({
	default: {
		query: vi.fn(() => {
			const qb = {
				where: vi.fn(() => qb),
				andWhere: vi.fn(() => qb),
				first: vi.fn(() =>
					Promise.resolve({ secret: "hash", verifyPassword: vi.fn(() => Promise.resolve(true)) }),
				),
				insert: vi.fn(() => Promise.resolve()),
				patch: vi.fn(() => Promise.resolve()),
			};
			return qb;
		}),
	},
}));

vi.mock("../../models/user_permission.js", () => ({
	default: {
		query: vi.fn(() => {
			const qb = {
				where: vi.fn(() => qb),
				first: vi.fn(() => Promise.resolve({ id: 1 })),
				insert: vi.fn(() => Promise.resolve({ id: 1 })),
				insertAndFetch: vi.fn((data) => Promise.resolve({ id: 1, ...data })),
				patchAndFetchById: vi.fn((id, data) => Promise.resolve({ id, ...data })),
			};
			return qb;
		}),
	},
}));

vi.mock("../../modules/audit-log/index.js", () => ({
	auditLogService: {
		add: vi.fn(() => Promise.resolve()),
	},
}));

vi.mock("../../modules/token/index.js", () => ({
	tokenService: {
		getTokenFromEmail: vi.fn(() => Promise.resolve({ token: "tok" })),
		getTokenFromUser: vi.fn((user) => Promise.resolve({ token: "tok", expires: "2026-01-01", user })),
	},
}));

vi.mock("../../lib/error.js", () => ({
	default: {
		ValidationError: class ValidationError extends Error {
			constructor(m) {
				super(m);
				this.name = "ValidationError";
			}
		},
		ItemNotFoundError: class ItemNotFoundError extends Error {
			constructor(m) {
				super(m ? `Not Found - ${m}` : "Not Found");
				this.name = "ItemNotFoundError";
			}
		},
		PermissionError: class PermissionError extends Error {
			constructor(m) {
				super(m);
				this.name = "PermissionError";
			}
		},
		InternalValidationError: class InternalValidationError extends Error {
			constructor(m) {
				super(m);
				this.name = "InternalValidationError";
			}
		},
		InternalError: class InternalError extends Error {
			constructor(m) {
				super(m);
				this.name = "InternalError";
			}
		},
	},
}));

vi.mock("../../lib/utils.js", () => ({
	default: {
		omitRows: () => (rows) => rows,
		omitRow: () => (row) => row,
	},
}));

vi.mock("lodash", () => ({
	default: {
		omit: (obj, keys) => {
			const result = { ...obj };
			for (const k of Array.isArray(keys) ? keys : [keys]) delete result[k];
			return result;
		},
		assign: Object.assign,
		each: (arr, fn) => arr.forEach(fn),
		map: (arr, fn) => arr.map(fn),
	},
}));

vi.mock("node:fs", () => ({
	default: {
		existsSync: vi.fn(() => true),
		mkdirSync: vi.fn(),
		unlinkSync: vi.fn(),
		promises: {
			writeFile: vi.fn(() => Promise.resolve()),
			readFile: vi.fn(() => Promise.resolve(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))),
			readdir: vi.fn(() => Promise.resolve(["fullchain.pem", "privkey.pem"])),
			mkdir: vi.fn(() => Promise.resolve()),
			rm: vi.fn(() => Promise.resolve()),
			realpath: vi.fn((p) => Promise.resolve(p)),
		},
	},
}));

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

	// ── omissions extended ─────────────────────────────────────────────

	describe("omissions – extended", () => {
		it("should include permissions.created_on and permissions.modified_on", () => {
			const result = omissions();
			expect(result).toContain("permissions.created_on");
			expect(result).toContain("permissions.modified_on");
		});

		it("should return a fresh array each call", () => {
			const a = omissions();
			const b = omissions();
			expect(a).not.toBe(b);
			expect(a).toEqual(b);
		});
	});

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
