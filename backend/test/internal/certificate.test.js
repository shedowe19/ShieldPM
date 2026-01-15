import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies to avoid side effects (db connection, file writing)
vi.mock("../../models/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/audit-log.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../lib/certbot.js", () => ({ installPlugin: vi.fn() }));

vi.mock("proxy-agent", () => ({ ProxyAgent: vi.fn() }));
vi.mock("node:https", () => {
	const request = vi.fn((url, options, cb) => {
		const res = {
			on: (event, handler) => {
				if (event === "data") {
					handler(JSON.stringify({ responsecode: "200", htmlresponse: "Success" }));
				}
				if (event === "end") {
					handler();
				}
			},
			statusCode: 200,
		};
		// Execute callback immediately
		cb(res);
		// Return mocked request object
		return { write: vi.fn(), end: vi.fn(), on: vi.fn() };
	});

	return {
		default: { request },
		request,
	};
});

// Mock fs
vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		mkdirSync: vi.fn(),
		writeFileSync: vi.fn(),
		unlinkSync: vi.fn(),
	};
});

// Import the module under test
import internalCertificate from "../../internal/certificate.js";

describe("Security Fix: Prototype Pollution", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return an object with null prototype", async () => {
		const mockAccess = {
			can: vi.fn().mockResolvedValue(true),
		};
		const payload = {
			domains: ["example.com", "test.com"],
		};

		const result = await internalCertificate.testHttpsChallenge(mockAccess, payload);

		expect(result).toBeDefined();
		// In our mock, performTestForDomain calls logic that returns "ok" (since response matches Success)
		expect(result["example.com"]).toBe("ok");
		expect(result["test.com"]).toBe("ok");

		// This is the key check: the object should have null prototype
		expect(Object.getPrototypeOf(result)).toBeNull();
		expect(result.__proto__).toBeUndefined();
	});
});
