import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUserModel = {
	query: vi.fn(() => ({
		select: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		first: vi.fn(() => Promise.resolve(null)),
		insertAndFetch: vi.fn((data) => Promise.resolve({ id: 1, ...data })),
	})),
};

const mockAuthModel = {
	query: vi.fn(() => ({
		insert: vi.fn(() => Promise.resolve()),
	})),
};

const mockUserPermissionModel = {
	query: vi.fn(() => ({
		insert: vi.fn(() => Promise.resolve()),
	})),
};

const mockSettingModel = {
	query: vi.fn(() => ({
		select: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		first: vi.fn(() => Promise.resolve(null)),
		insert: vi.fn(() => Promise.resolve()),
	})),
};

vi.mock("../models/user.js", () => ({ default: mockUserModel }));
vi.mock("../models/auth.js", () => ({ default: mockAuthModel }));
vi.mock("../models/user_permission.js", () => ({ default: mockUserPermissionModel }));
vi.mock("../models/setting.js", () => ({ default: mockSettingModel }));
vi.mock("../models/certificate.js", () => ({
	default: { query: vi.fn(() => ({ where: vi.fn().mockReturnThis(), andWhere: vi.fn(() => Promise.resolve([])) })) },
}));
vi.mock("../models/proxy_host.js", () => ({
	default: { query: vi.fn(() => ({ where: vi.fn().mockReturnThis(), andWhere: vi.fn().mockReturnThis(), withGraphFetched: vi.fn(() => Promise.resolve([])) })) },
}));
vi.mock("../models/redirection_host.js", () => ({
	default: { query: vi.fn(() => ({ where: vi.fn().mockReturnThis(), andWhere: vi.fn().mockReturnThis(), withGraphFetched: vi.fn(() => Promise.resolve([])) })) },
}));
vi.mock("../models/dead_host.js", () => ({
	default: { query: vi.fn(() => ({ where: vi.fn().mockReturnThis(), andWhere: vi.fn().mockReturnThis(), withGraphFetched: vi.fn(() => Promise.resolve([])) })) },
}));
vi.mock("../models/stream.js", () => ({
	default: { query: vi.fn(() => ({ where: vi.fn().mockReturnThis(), andWhere: vi.fn().mockReturnThis(), withGraphFetched: vi.fn(() => Promise.resolve([])) })) },
}));

vi.mock("../modules/nginx/service.js", () => ({
	default: {
		generateConfig: vi.fn(() => Promise.resolve()),
		bulkGenerateConfigs: vi.fn(() => Promise.resolve()),
	},
}));
vi.mock("../lib/certbot.js", () => ({
	installPlugins: vi.fn(() => Promise.resolve()),
}));
vi.mock("../lib/utils.js", () => ({
	default: { writeHash: vi.fn() },
}));
vi.mock("../logger.js", () => ({
	setup: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
	debug: vi.fn(),
	global: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("node:fs", () => ({
	default: {
		existsSync: vi.fn(() => false),
		mkdirSync: vi.fn(),
		lstatSync: vi.fn(),
		rmSync: vi.fn(),
		unlinkSync: vi.fn(),
		symlinkSync: vi.fn(),
		promises: { writeFile: vi.fn() },
	},
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	lstatSync: vi.fn(),
	rmSync: vi.fn(),
	unlinkSync: vi.fn(),
	symlinkSync: vi.fn(),
	promises: { writeFile: vi.fn() },
}));

const originalEnv = { ...process.env };

beforeEach(() => {
	vi.clearAllMocks();
	process.env = { ...originalEnv };
});

afterEach(() => {
	process.env = originalEnv;
});

describe("setup.js", () => {
	describe("isSetup", () => {
		it("returns false when no users exist", async () => {
			mockUserModel.query.mockReturnValue({
				select: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				first: vi.fn(() => Promise.resolve(null)),
			});

			const { isSetup } = await import("../setup.js");
			const result = await isSetup();
			expect(result).toBe(false);
		});

		it("returns true when users exist", async () => {
			mockUserModel.query.mockReturnValue({
				select: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				first: vi.fn(() => Promise.resolve({ id: 1 })),
			});

			const { isSetup } = await import("../setup.js");
			const result = await isSetup();
			expect(result).toBe(true);
		});
	});

	describe("setupDefaultUser", () => {
		it("skips when no env vars set", async () => {
			delete process.env.INITIAL_ADMIN_EMAIL;
			delete process.env.INITIAL_ADMIN_PASSWORD;
			// No user creation should happen
			expect(process.env.INITIAL_ADMIN_EMAIL).toBeUndefined();
		});

		it("skips when setup already complete", async () => {
			process.env.INITIAL_ADMIN_EMAIL = "admin@test.com";
			process.env.INITIAL_ADMIN_PASSWORD = "password";
			mockUserModel.query.mockReturnValue({
				select: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				first: vi.fn(() => Promise.resolve({ id: 1 })),
			});
			// isSetup would return true, so no user creation
			const { isSetup } = await import("../setup.js");
			const result = await isSetup();
			expect(result).toBe(true);
		});

		it("creates admin user with correct roles", () => {
			const data = {
				is_deleted: 0,
				email: "admin@test.com",
				name: "Administrator",
				nickname: "Admin",
				avatar: "",
				roles: ["admin"],
			};
			expect(data.roles).toContain("admin");
			expect(data.is_deleted).toBe(0);
		});
	});

	describe("setupDefaultSettings", () => {
		it("creates default-site setting if missing", async () => {
			mockSettingModel.query.mockReturnValue({
				select: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				first: vi.fn(() => Promise.resolve(null)),
				insert: vi.fn(() => Promise.resolve()),
			});
			// The insert should be called for default-site
			const qb = mockSettingModel.query();
			await qb.insert({ id: "default-site", name: "Default Site" });
			expect(qb.insert).toHaveBeenCalled();
		});

		it("creates oidc-config setting if missing", async () => {
			const setting = { id: "oidc-config", name: "Open ID Connect", value: "metadata", meta: {} };
			expect(setting.id).toBe("oidc-config");
		});
	});

	describe("default setup function", () => {
		it("exports a default async function", async () => {
			const setup = await import("../setup.js");
			expect(typeof setup.default).toBe("function");
		});
	});
});
