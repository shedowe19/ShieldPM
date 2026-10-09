import { beforeEach, describe, expect, it, vi } from "vitest";
import errs from "../../lib/error.js";

const mocks = vi.hoisted(() => ({
	apiValidator: vi.fn(),
	handlers: new Map(),
	peerQuery: vi.fn(),
	service: {
		generateClientConfig: vi.fn(),
		generateQRCode: vi.fn(),
		getSettings: vi.fn(),
		refreshStatuses: vi.fn(),
		updateSettings: vi.fn(),
	},
}));

vi.mock("express", () => ({
	default: {
		Router: () => {
			const router = {};
			for (const method of ["delete", "get", "post", "put"]) {
				router[method] = (path, handler) => {
					mocks.handlers.set(`${method} ${path}`, handler);
					return router;
				};
			}
			router.use = () => router;
			return router;
		},
	},
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/wireguard.js", () => ({ default: mocks.service }));
vi.mock("../../lib/config.js", () => ({ isDemoMode: () => false }));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => (_req, _res, next) => next() }));
vi.mock("../../lib/validator/api.js", () => ({ default: mocks.apiValidator }));
vi.mock("../../logger.js", () => ({ global: { debug: vi.fn() } }));
vi.mock("../../models/wireguard_peer.js", () => ({ default: { query: mocks.peerQuery } }));
vi.mock("../../schema/index.js", () => ({ getValidationSchema: () => ({ type: "object" }) }));

import "../../routes/nginx/wireguard.js";

const routes = [
	["get /status", "refreshStatuses"],
	["get /settings", "getSettings"],
	["put /settings", "updateSettings"],
	["get /:id/config", "generateClientConfig"],
	["get /:id/qrcode", "generateQRCode"],
];

const failures = [
	["public configuration failure", () => new errs.ConfigurationError("Invalid WireGuard settings")],
	["peer removed during download", () => new errs.ItemNotFoundError(1)],
	[
		"private runtime failure with a diagnostic cause",
		() => new errs.InternalError("Could not generate a QR code", new Error("PRIVATE_KEY_SENTINEL")),
	],
	["private validation failure", () => new errs.InternalValidationError("Invalid stored key")],
	["unexpected unclassified failure", () => new Error("PRIVATE_DATABASE_SENTINEL")],
];

describe("WireGuard error delegation", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.apiValidator.mockResolvedValue({});
		const query = {
			andWhere: vi.fn().mockReturnThis(),
			first: vi.fn().mockResolvedValue({ id: 1, owner_user_id: 7 }),
			where: vi.fn().mockReturnThis(),
		};
		mocks.peerQuery.mockReturnValue(query);
	});

	for (const [route, operation] of routes) {
		for (const [description, createError] of failures) {
			it(`${route} delegates ${description} to the standard error middleware`, async () => {
				const error = createError();
				mocks.service[operation].mockRejectedValue(error);
				const req = { body: {}, params: { id: "1" } };
				const res = {
					locals: {
						access: {
							can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
							token: { getUserId: () => 7 },
						},
					},
					send: vi.fn(),
					status: vi.fn().mockReturnThis(),
				};
				const next = vi.fn();

				await mocks.handlers.get(route)(req, res, next);

				expect(next).toHaveBeenCalledExactlyOnceWith(error);
				expect(res.status).not.toHaveBeenCalled();
				expect(res.send).not.toHaveBeenCalled();
			});
		}
	}
});
