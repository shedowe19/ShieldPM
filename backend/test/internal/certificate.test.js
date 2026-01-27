import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies to avoid side effects (db connection, file writing)
vi.mock("../../models/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/audit-log.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../internal/certbot.js", () => ({
	installPlugin: vi.fn(),
	testHttpsChallenge: vi.fn().mockImplementation((_access, domains) => {
		const result = Object.create(null);
		domains.domains.forEach((d) => {
			result[d] = "ok";
		});
		return Promise.resolve(result);
	}),
}));

vi.mock("proxy-agent", () => ({ ProxyAgent: vi.fn() }));
vi.mock("node:https", () => {
	const request = vi.fn((_url, _options, cb) => {
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
		// Add mocks for reading keys to prevent generateKeys from running
		existsSync: vi.fn((path) => {
			if (typeof path === "string" && path.includes("keys.json")) return true;
			return false;
		}),
		readFileSync: vi.fn((path) => {
			if (typeof path === "string" && path.includes("keys.json")) {
				return JSON.stringify({
					key: "mock-private-key",
					pub: "mock-public-key",
					encryptionKey: "mock-encryption-key",
				});
			}
			// For specific file check in configure()
			if (typeof path === "string" && path.includes("default.json")) {
				throw new Error("ENOENT");
			}
			return Buffer.from("");
		}),
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
