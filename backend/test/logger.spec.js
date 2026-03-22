import { describe, expect, it, vi } from "vitest";

vi.mock("signale", () => {
	const mockLogger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		success: vi.fn(),
	};
	class Signale {
		constructor() {
			Object.assign(this, mockLogger);
		}
	}
	return { default: { Signale }, Signale };
});

describe("logger.js", () => {
	it("exports named loggers", async () => {
		const logger = await import("../logger.js");
		expect(logger.global).toBeDefined();
		expect(logger.express).toBeDefined();
		expect(logger.nginx).toBeDefined();
		expect(logger.setup).toBeDefined();
		expect(logger.oidc).toBeDefined();
		expect(logger.analytics).toBeDefined();
	});

	it("exports debug helper function", async () => {
		const logger = await import("../logger.js");
		expect(typeof logger.debug).toBe("function");
	});

	it("debug calls logger.debug", async () => {
		const logger = await import("../logger.js");
		const mockLogger = { debug: vi.fn() };
		logger.debug(mockLogger, "test message");
		expect(mockLogger.debug).toHaveBeenCalledWith("test message");
	});

	it("debug passes multiple arguments", async () => {
		const logger = await import("../logger.js");
		const mockLogger = { debug: vi.fn() };
		logger.debug(mockLogger, "msg", "extra");
		expect(mockLogger.debug).toHaveBeenCalledWith("msg", "extra");
	});

	it("exports all expected scoped loggers", async () => {
		const logger = await import("../logger.js");
		const expectedScopes = [
			"global",
			"migrate",
			"express",
			"access",
			"nginx",
			"ssl",
			"certbot",
			"importer",
			"setup",
			"ipRanges",
			"remoteVersion",
			"oidc",
			"analytics",
			"internal",
		];
		for (const scope of expectedScopes) {
			expect(logger[scope]).toBeDefined();
		}
	});

	it("each logger has standard methods", async () => {
		const logger = await import("../logger.js");
		const methods = ["info", "warn", "error", "debug"];
		for (const method of methods) {
			expect(typeof logger.global[method]).toBe("function");
			expect(typeof logger.express[method]).toBe("function");
		}
	});
});
