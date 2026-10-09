import { beforeEach, describe, expect, it, vi } from "vitest";
import errs from "../../lib/error.js";

const mocks = vi.hoisted(() => ({
	addAuditLog: vi.fn(),
	apiValidator: vi.fn(),
	getValidationSchema: vi.fn(),
	settingsHandler: null,
	updateSettings: vi.fn(),
}));

vi.mock("express", () => ({
	default: {
		Router: () => {
			const router = {
				delete: () => router,
				get: () => router,
				post: () => router,
				put: (path, handler) => {
					if (path === "/settings") mocks.settingsHandler = handler;
					return router;
				},
				use: () => router,
			};
			return router;
		},
	},
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: mocks.addAuditLog } }));
vi.mock("../../internal/wireguard.js", () => ({ default: { updateSettings: mocks.updateSettings } }));
vi.mock("../../lib/config.js", () => ({ isDemoMode: vi.fn().mockReturnValue(false) }));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => (_req, _res, next) => next() }));
vi.mock("../../lib/validator/api.js", () => ({ default: mocks.apiValidator }));
vi.mock("../../logger.js", () => ({ global: { debug: vi.fn() } }));
vi.mock("../../models/wireguard_peer.js", () => ({ default: {} }));
vi.mock("../../schema/index.js", () => ({ getValidationSchema: mocks.getValidationSchema }));

import "../../routes/nginx/wireguard.js";

describe("WireGuard settings route validation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getValidationSchema.mockReturnValue({ type: "object" });
	});

	it("returns 400 without updating settings when API validation rejects PostUp injection", async () => {
		const validationError = new errs.ValidationError("endpoint must not contain newlines");
		mocks.apiValidator.mockRejectedValue(validationError);
		const access = { can: vi.fn().mockResolvedValue(true) };
		const req = { body: { endpoint: "vpn.example.com\nPostUp = iptables -F FORWARD" } };
		const res = {
			locals: { access },
			send: vi.fn(),
			status: vi.fn().mockReturnThis(),
		};

		const next = vi.fn();
		await mocks.settingsHandler(req, res, next);

		expect(access.can).toHaveBeenCalledWith("settings:update", "wireguard-config");
		expect(mocks.apiValidator).toHaveBeenCalledWith({ type: "object" }, req.body);
		expect(mocks.updateSettings).not.toHaveBeenCalled();
		expect(next).toHaveBeenCalledWith(validationError);
		expect(res.status).not.toHaveBeenCalled();
		expect(res.send).not.toHaveBeenCalled();
	});
});
