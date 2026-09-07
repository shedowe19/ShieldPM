import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ handlers: {}, createClientCert: vi.fn(), download: vi.fn() }));
vi.mock("express", () => ({
	default: {
		Router: () => {
			const router = {
				get: () => router,
				post: () => router,
				route: (path) => {
					const route = {
						all: () => route,
						options: () => route,
						get: () => route,
						put: () => route,
						delete: () => route,
						post: (...handlers) => {
							mocks.handlers[path] = handlers.at(-1);
							return route;
						},
					};
					return route;
				},
			};
			return router;
		},
	},
}));
vi.mock("express-fileupload", () => ({ default: () => vi.fn() }));
vi.mock("express-rate-limit", () => ({ default: () => vi.fn() }));
vi.mock("../../internal/certificate.js", () => ({ default: { download: mocks.download } }));
vi.mock("../../internal/pki.js", () => ({ default: { createClientCert: mocks.createClientCert } }));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => vi.fn() }));
vi.mock("../../lib/validator/index.js", () => ({ default: async (_schema, payload) => payload }));
vi.mock("../../lib/validator/api.js", () => ({ default: async (_schema, payload) => payload }));
vi.mock("../../schema/index.js", () => ({ getValidationSchema: () => ({}) }));

import "../../routes/nginx/certificates.js";

const response = (can) => ({ locals: { access: { can } }, status: vi.fn().mockReturnThis(), download: vi.fn() });

describe("certificate issuance and download routes", () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it("requires certificate create permission before generating a trusted client identity", async () => {
		const mkdir = vi.spyOn(fs, "mkdtemp").mockResolvedValue("/mock/client");
		const can = vi.fn().mockRejectedValue(new Error("Permission Denied"));
		await expect(
			mocks.handlers["/internal/client"](
				{ body: { common_name: "Client", password: "test-password" } },
				response(can),
				vi.fn(),
			),
		).rejects.toThrow("Permission Denied");
		expect(can).toHaveBeenCalledWith("certificates:create", expect.objectContaining({ common_name: "Client" }));
		expect(mocks.createClientCert).not.toHaveBeenCalled();
		expect(mkdir).not.toHaveBeenCalled();
	});

	it("cleans certificate bundles after their download completes", async () => {
		vi.spyOn(fs, "rm").mockResolvedValue();
		mocks.download.mockResolvedValue({ fileName: "/tmp/mock-certificate.zip" });
		const res = response(vi.fn());
		const next = vi.fn();
		await mocks.handlers["/download"]({ body: { id: 3 } }, res, next);
		await res.download.mock.calls[0][1]();
		expect(fs.rm).toHaveBeenCalledWith("/tmp/mock-certificate.zip", { force: true });
		expect(next).not.toHaveBeenCalled();
	});
});
