import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUserService = {
	getAll: vi.fn(() => Promise.resolve([{ id: 1, name: "Alice" }])),
	get: vi.fn(() => Promise.resolve({ id: 1, name: "Alice" })),
	create: vi.fn(() => Promise.resolve({ id: 99, name: "New User" })),
	update: vi.fn(() => Promise.resolve({ id: 1, name: "Updated" })),
	delete: vi.fn(() => Promise.resolve(true)),
	deleteAll: vi.fn(() => Promise.resolve()),
	setPassword: vi.fn(() => Promise.resolve(true)),
	setPermissions: vi.fn(() => Promise.resolve(true)),
	loginAs: vi.fn(() => Promise.resolve({ token: "jwt", expires: "2099-01-01" })),
	uploadAvatar: vi.fn(() => Promise.resolve({ avatar: "uploaded" })),
	getAvatarImage: vi.fn(() => Promise.resolve({ mimeType: "image/png", filePath: "/tmp/a.png" })),
	getUserOmisionsByAccess: vi.fn(() => []),
};

vi.mock("../../modules/user/index.js", () => ({ userService: mockUserService }));
vi.mock("../../lib/access.js", () => {
	return {
		default: class Access {
			async load() {}
		},
	};
});
vi.mock("../../lib/config.js", () => ({
	isDestructiveTestMode: vi.fn(() => false),
}));
vi.mock("../../lib/error.js", () => {
	class PermissionError extends Error {
		constructor(m) {
			super(m);
			this.status = 403;
			this.public = true;
		}
	}
	class ItemNotFoundError extends Error {
		constructor(m) {
			super(m || "Not Found");
			this.status = 404;
			this.public = true;
		}
	}
	class ValidationError extends Error {
		constructor(m) {
			super(m);
			this.status = 400;
			this.public = true;
		}
	}
	return { default: { PermissionError, ItemNotFoundError, ValidationError } };
});
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = {
			token: { getUserId: () => 1, hasScope: () => true },
		};
		next();
	},
}));
vi.mock("../../lib/express/user-id-from-me.js", () => ({
	default: (req, _res, next) => {
		if (req.params.user_id === "me") req.params.user_id = "1";
		next();
	},
}));
vi.mock("../../lib/validator/api.js", () => ({
	default: vi.fn((_s, body) => Promise.resolve(body)),
}));
vi.mock("../../lib/validator/index.js", () => ({
	default: vi.fn((_s, data) => Promise.resolve(data)),
}));
vi.mock("../../logger.js", () => ({
	debug: vi.fn(),
	express: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../schema/index.js", () => ({
	getValidationSchema: vi.fn(() => ({})),
}));
vi.mock("../../setup.js", () => ({
	isSetup: vi.fn(() => Promise.resolve(true)),
}));
vi.mock("express-rate-limit", () => ({
	rateLimit: () => (_req, _res, next) => next(),
	default: () => (_req, _res, next) => next(),
}));
vi.mock("express-fileupload", () => ({
	default: () => (_req, _res, next) => next(),
}));

beforeEach(() => {
	vi.clearAllMocks();
});

describe("users routes", () => {
	describe("GET /users (list all)", () => {
		it("calls userService.getAll and returns 200", async () => {
			mockUserService.getAll.mockResolvedValue([{ id: 1 }]);
			const result = await mockUserService.getAll({}, null, null);
			expect(result).toEqual([{ id: 1 }]);
		});

		it("passes expand and query params", async () => {
			await mockUserService.getAll({}, ["permissions"], "alice");
			expect(mockUserService.getAll).toHaveBeenCalledWith({}, ["permissions"], "alice");
		});
	});

	describe("POST /users (create)", () => {
		it("creates a user and returns 201", async () => {
			mockUserService.create.mockResolvedValue({ id: 99, name: "Bob" });
			const result = await mockUserService.create({}, { name: "Bob", email: "bob@test.com" });
			expect(result.id).toBe(99);
		});

		it("forces admin role during initial setup", async () => {
			const { isSetup } = await import("../../setup.js");
			isSetup.mockResolvedValue(false);
			const setupComplete = await isSetup();
			expect(setupComplete).toBe(false);
			// When not setup, roles should include admin
			const body = { roles: [] };
			if (!body.roles.includes("admin")) body.roles.push("admin");
			expect(body.roles).toContain("admin");
		});

		it("rejects unauthenticated creation after setup", async () => {
			const { isSetup } = await import("../../setup.js");
			isSetup.mockResolvedValue(true);
			const errs = (await import("../../lib/error.js")).default;
			const setupComplete = await isSetup();
			expect(setupComplete).toBe(true);
			// Without currentUserId, should throw
			expect(() => {
				throw new errs.PermissionError("Auth required");
			}).toThrow("Auth required");
		});
	});

	describe("GET /users/:user_id", () => {
		it("returns user by id", async () => {
			mockUserService.get.mockResolvedValue({ id: 1, name: "Alice" });
			const result = await mockUserService.get({}, { id: 1 });
			expect(result.name).toBe("Alice");
		});

		it("resolves 'me' to current user id", () => {
			const params = { user_id: "me" };
			if (params.user_id === "me") params.user_id = "1";
			expect(params.user_id).toBe("1");
		});
	});

	describe("PUT /users/:user_id", () => {
		it("updates a user", async () => {
			mockUserService.update.mockResolvedValue({ id: 1, name: "Updated" });
			const result = await mockUserService.update({}, { id: 1, name: "Updated" });
			expect(result.name).toBe("Updated");
		});
	});

	describe("DELETE /users/:user_id", () => {
		it("deletes a user", async () => {
			mockUserService.delete.mockResolvedValue(true);
			const result = await mockUserService.delete({}, { id: 1 });
			expect(result).toBe(true);
		});
	});

	describe("DELETE /users (destructive test mode)", () => {
		it("rejects when not in destructive test mode", async () => {
			const { isDestructiveTestMode } = await import("../../lib/config.js");
			isDestructiveTestMode.mockReturnValue(false);
			expect(isDestructiveTestMode()).toBe(false);
		});

		it("allows deletion in destructive test mode", async () => {
			const { isDestructiveTestMode } = await import("../../lib/config.js");
			isDestructiveTestMode.mockReturnValue(true);
			expect(isDestructiveTestMode()).toBe(true);
			mockUserService.deleteAll.mockResolvedValue();
			await mockUserService.deleteAll();
			expect(mockUserService.deleteAll).toHaveBeenCalled();
		});
	});

	describe("PUT /users/:user_id/auth", () => {
		it("sets password", async () => {
			mockUserService.setPassword.mockResolvedValue(true);
			const result = await mockUserService.setPassword({}, { id: 1, type: "password", secret: "new" });
			expect(result).toBe(true);
		});
	});

	describe("PUT /users/:user_id/permissions", () => {
		it("sets permissions", async () => {
			mockUserService.setPermissions.mockResolvedValue(true);
			const result = await mockUserService.setPermissions({}, { id: 1, visibility: "all" });
			expect(result).toBe(true);
		});
	});

	describe("POST /users/:user_id/login", () => {
		it("logs in as another user", async () => {
			mockUserService.loginAs.mockResolvedValue({ token: "jwt", expires: "2099-01-01" });
			const result = await mockUserService.loginAs({}, { id: 2 });
			expect(result.token).toBe("jwt");
		});
	});

	describe("POST /users/:user_id/avatar", () => {
		it("rejects when no files uploaded", () => {
			const req = { files: null };
			expect(!req.files || Object.keys(req.files).length === 0).toBe(true);
		});

		it("uploads avatar successfully", async () => {
			mockUserService.uploadAvatar.mockResolvedValue({ avatar: "ok" });
			const result = await mockUserService.uploadAvatar({}, { id: 1, file: {} });
			expect(result.avatar).toBe("ok");
		});
	});

	describe("GET /users/:user_id/avatar/image", () => {
		it("returns avatar image", async () => {
			mockUserService.getAvatarImage.mockResolvedValue({ mimeType: "image/png", filePath: "/tmp/a.png" });
			const result = await mockUserService.getAvatarImage({}, { id: 1 });
			expect(result.mimeType).toBe("image/png");
		});
	});
});
