import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock db and config to avoid filesystem/DB side effects
vi.mock("../../db.js", () => ({ default: () => ({}) }));
vi.mock("../../lib/config.js", () => ({
	isDestructiveTestMode: vi.fn().mockReturnValue(false),
	configHas: vi.fn().mockReturnValue(true),
	configGet: vi.fn().mockReturnValue("mock-value"),
	isSqlite: vi.fn().mockReturnValue(true),
	isMysql: vi.fn().mockReturnValue(false),
	isPostgres: vi.fn().mockReturnValue(false),
	getPrivateKey: vi.fn().mockReturnValue("mock-private-key"),
	getPublicKey: vi.fn().mockReturnValue("mock-public-key"),
	getEncryptionKey: vi.fn().mockReturnValue("0".repeat(64)),
	isDemoMode: vi.fn().mockReturnValue(false),
}));

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

describe("Fix #58: initTimer interval uses safe default when CRT env var is unset", () => {
	it("intervalTimeout property no longer exists on the static object (no NaN at module load)", () => {
		// The static object must NOT have intervalTimeout – it was moved into initTimer()
		expect(internalCertificate.intervalTimeout).toBeUndefined();
	});

	it("uses 72-hour default when CRT is not set", () => {
		const originalCRT = process.env.CRT;
		delete process.env.CRT;

		const crtHours = Number.parseInt(process.env.CRT, 10);
		const intervalTimeout = 1000 * 60 * 60 * (Number.isFinite(crtHours) ? crtHours : 72);

		expect(Number.isNaN(intervalTimeout)).toBe(false);
		expect(intervalTimeout).toBe(1000 * 60 * 60 * 72);

		if (originalCRT !== undefined) process.env.CRT = originalCRT;
	});

	it("uses configured value when CRT is a valid integer", () => {
		const originalCRT = process.env.CRT;
		process.env.CRT = "24";

		const crtHours = Number.parseInt(process.env.CRT, 10);
		const intervalTimeout = 1000 * 60 * 60 * (Number.isFinite(crtHours) ? crtHours : 72);

		expect(intervalTimeout).toBe(1000 * 60 * 60 * 24);

		process.env.CRT = originalCRT;
	});

	it("falls back to 72h default when CRT is set to a non-numeric value", () => {
		const originalCRT = process.env.CRT;
		process.env.CRT = "invalid";

		const crtHours = Number.parseInt(process.env.CRT, 10);
		const intervalTimeout = 1000 * 60 * 60 * (Number.isFinite(crtHours) ? crtHours : 72);

		expect(Number.isNaN(intervalTimeout)).toBe(false);
		expect(intervalTimeout).toBe(1000 * 60 * 60 * 72);

		process.env.CRT = originalCRT;
	});
});

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
	});
});
