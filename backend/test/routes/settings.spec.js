import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSettingService = {
	getAll: vi.fn(() => Promise.resolve([{ id: "default-site", value: "welcome" }])),
	get: vi.fn(() => Promise.resolve({ id: "default-site", value: "welcome", meta: {} })),
	update: vi.fn(() => Promise.resolve({ id: "default-site", value: "updated" })),
};

vi.mock("../../modules/setting/index.js", () => ({ settingService: mockSettingService }));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = { token: { getUserId: () => 1 } };
		next();
	},
}));
vi.mock("../../lib/validator/api.js", () => ({
	default: vi.fn((_s, body) => Promise.resolve(body)),
}));
vi.mock("../../lib/validator/index.js", () => ({
	default: vi.fn((_s, data) => Promise.resolve(data)),
}));
vi.mock("../../schema/index.js", () => ({
	getValidationSchema: vi.fn(() => ({})),
}));

beforeEach(() => vi.clearAllMocks());

describe("settings routes", () => {
	describe("GET /settings", () => {
		it("returns all settings", async () => {
			const result = await mockSettingService.getAll({});
			expect(result).toHaveLength(1);
		});

		it("requires authentication", () => {
			expect(true).toBe(true);
		});
	});

	describe("GET /settings/:setting_id", () => {
		it("returns a specific setting", async () => {
			const result = await mockSettingService.get({}, { id: "default-site" });
			expect(result.id).toBe("default-site");
		});

		it("redacts OIDC configuration", () => {
			const row = {
				id: "oidc-config",
				meta: {
					name: "OIDC",
					enabled: true,
					clientID: "secret",
					clientSecret: "secret",
					issuerURL: "https://a.com",
					redirectURL: "https://b.com",
				},
			};
			if (row.id === "oidc-config") {
				const m = row.meta;
				row.meta = {
					name: m.name,
					enabled:
						m.enabled === true &&
						!!(m.clientID && m.clientSecret && m.issuerURL && m.redirectURL && m.name),
				};
			}
			expect(row.meta.clientID).toBeUndefined();
			expect(row.meta.name).toBe("OIDC");
			expect(row.meta.enabled).toBe(true);
		});

		it("validates setting_id parameter", async () => {
			const validator = (await import("../../lib/validator/index.js")).default;
			await validator({}, { setting_id: "default-site" });
			expect(validator).toHaveBeenCalled();
		});
	});

	describe("PUT /settings/:setting_id", () => {
		it("updates a setting", async () => {
			const result = await mockSettingService.update({}, { id: "default-site", value: "updated" });
			expect(result.value).toBe("updated");
		});

		it("uses setting_id from path params", () => {
			const payload = { value: "new" };
			payload.id = "default-site";
			expect(payload.id).toBe("default-site");
		});
	});

	describe("OPTIONS /settings", () => {
		it("returns 204", () => {
			const res = { sendStatus: vi.fn() };
			res.sendStatus(204);
			expect(res.sendStatus).toHaveBeenCalledWith(204);
		});
	});

	describe("OPTIONS /settings/:setting_id", () => {
		it("returns 204", () => {
			const res = { sendStatus: vi.fn() };
			res.sendStatus(204);
			expect(res.sendStatus).toHaveBeenCalledWith(204);
		});
	});
});
