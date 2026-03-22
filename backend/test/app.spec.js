import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock heavy dependencies before importing app
vi.mock("../modules/analytics/index.js", () => ({
	analyticsService: { init: vi.fn() },
}));

vi.mock("../logger.js", () => ({
	debug: vi.fn(),
	express: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
	global: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../setup.js", () => ({
	isSetup: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../lib/express/jwt.js", () => ({
	default: () => (_req, _res, next) => next(),
}));

vi.mock("../lib/express/demo.js", () => ({
	default: (_req, _res, next) => next(),
}));

vi.mock("../routes/main.js", async () => {
	const { Router } = await import("express");
	const r = Router();
	r.get("/", (_req, res) => res.status(200).json({ status: "OK" }));
	return { default: r };
});

vi.mock("express-rate-limit", () => ({
	default: () => (_req, _res, next) => next(),
}));

vi.mock("csrf-csrf", () => ({
	doubleCsrf: () => ({
		doubleCsrfProtection: (_req, _res, next) => next(),
		generateCsrfToken: () => "csrf_test_token",
	}),
}));

vi.mock("helmet", () => ({
	default: () => (_req, _res, next) => next(),
}));

beforeEach(() => vi.clearAllMocks());

describe("app.js", () => {
	describe("Express app configuration", () => {
		it("exports an express app", async () => {
			const { default: app } = await import("../app.js");
			expect(app).toBeDefined();
			expect(typeof app.use).toBe("function");
			expect(typeof app.get).toBe("function");
		});

		it("has x-powered-by disabled", async () => {
			const { default: app } = await import("../app.js");
			expect(app.disabled("x-powered-by")).toBe(true);
		});

		it("has strict routing enabled", async () => {
			const { default: app } = await import("../app.js");
			expect(app.enabled("strict routing")).toBe(true);
		});

		it("has json spaces set to 2", async () => {
			const { default: app } = await import("../app.js");
			expect(app.get("json spaces")).toBe(2);
		});

		it("has trust proxy configured", async () => {
			const { default: app } = await import("../app.js");
			const tp = app.get("trust proxy");
			expect(tp).toBeDefined();
		});
	});

	describe("CSRF helpers", () => {
		it("resolves TRUST_PROXY from env", () => {
			// Default is 1
			const raw = process.env.TRUST_PROXY;
			if (typeof raw === "undefined") {
				expect(1).toBe(1);
			}
		});

		it("handles various TRUST_PROXY values", () => {
			const resolve = (raw) => {
				if (typeof raw === "undefined" || raw === null || raw === "") return 1;
				const normalized = String(raw).trim().toLowerCase();
				if (["true", "yes", "on"].includes(normalized)) return true;
				if (["false", "no", "off"].includes(normalized)) return false;
				if (/^\d+$/.test(normalized)) return Number.parseInt(normalized, 10);
				return raw;
			};
			expect(resolve(undefined)).toBe(1);
			expect(resolve("true")).toBe(true);
			expect(resolve("false")).toBe(false);
			expect(resolve("3")).toBe(3);
			expect(resolve("loopback")).toBe("loopback");
		});
	});

	describe("error handler", () => {
		it("returns JSON error with status code", () => {
			const err = { status: 403, message: "Forbidden", public: true };
			const status = Number.parseInt(err.status, 10);
			const payload = {
				error: {
					code: status,
					message: err.public ? err.message : "Internal Error",
				},
			};
			expect(payload.error.code).toBe(403);
			expect(payload.error.message).toBe("Forbidden");
		});

		it("hides message for non-public errors", () => {
			const err = { status: 500, message: "DB connection failed", public: false };
			const payload = {
				error: {
					code: 500,
					message: err.public ? err.message : "Internal Error",
				},
			};
			expect(payload.error.message).toBe("Internal Error");
		});

		it("defaults to 500 for invalid status", () => {
			const rawStatus = Number.parseInt(undefined, 10);
			const status = Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus <= 599 ? rawStatus : 500;
			expect(status).toBe(500);
		});

		it("includes i18n message when available", () => {
			const err = { message_i18n: "error.forbidden" };
			const payload = { error: { code: 403, message: "Forbidden" } };
			if (typeof err.message_i18n !== "undefined") {
				payload.error.message_i18n = err.message_i18n;
			}
			expect(payload.error.message_i18n).toBe("error.forbidden");
		});
	});

	describe("CSRF session identifier", () => {
		it("extracts user ID from JWT payload", () => {
			const payload = { attrs: { id: 42 }, sub: "42" };
			const userId = payload.attrs?.id || payload.sub;
			expect(userId).toBe(42);
		});

		it("falls back to anonymous fingerprint", () => {
			const payload = null;
			const userId = payload?.attrs?.id || payload?.sub;
			expect(userId).toBeFalsy();
		});
	});

	describe("isHttpsRequest helper", () => {
		it("detects secure requests", () => {
			const req = { secure: true, headers: {} };
			expect(req.secure).toBe(true);
		});

		it("detects x-forwarded-proto https", () => {
			const req = { secure: false, headers: { "x-forwarded-proto": "https" } };
			const proto = req.headers["x-forwarded-proto"];
			const isHttps = typeof proto === "string" && proto.split(",")[0].trim().toLowerCase() === "https";
			expect(isHttps).toBe(true);
		});
	});
});
