import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("certificate renewal timer", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(internalCertificate, "processExpiringHosts").mockResolvedValue();
		vi.spyOn(internalCertificate, "cleanUpMissingCertificates").mockResolvedValue();
	});

	afterEach(() => {
		clearInterval(internalCertificate.interval);
		internalCertificate.interval = null;
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		vi.useRealTimers();
	});

	it.each([
		[undefined, 72],
		["invalid", 72],
		["24", 24],
		["1", 1],
		["596", 596],
		["597", 72],
		["1.5", 72],
	])("schedules the actual renewal callback for CRT=%s every %s hours", async (value, hours) => {
		vi.stubEnv("CRT", value);
		await internalCertificate.initTimer();
		expect(internalCertificate.processExpiringHosts).toHaveBeenCalledTimes(1);
		expect(internalCertificate.cleanUpMissingCertificates).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(hours * 3600000 - 1);
		expect(internalCertificate.processExpiringHosts).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(internalCertificate.processExpiringHosts).toHaveBeenCalledTimes(2);
	});

	it("replaces the previous schedule with the current runtime configuration", async () => {
		vi.stubEnv("CRT", "24");
		await internalCertificate.initTimer();
		vi.stubEnv("CRT", "48");
		await internalCertificate.initTimer();
		expect(vi.getTimerCount()).toBe(1);
		internalCertificate.processExpiringHosts.mockClear();
		await vi.advanceTimersByTimeAsync(24 * 3600000);
		expect(internalCertificate.processExpiringHosts).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(24 * 3600000);
		expect(internalCertificate.processExpiringHosts).toHaveBeenCalledOnce();
	});
});

describe("certificate HTTPS challenge delegation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns the result produced by certbot without changing its prototype", async () => {
		const mockAccess = {
			can: vi.fn().mockResolvedValue(true),
		};
		const payload = {
			domains: ["example.com", "test.com"],
		};

		const result = await internalCertificate.testHttpsChallenge(mockAccess, payload);

		expect(result).toBeDefined();
		// The adapter delegates to certbot; transport and result construction are tested there.
		expect(result["example.com"]).toBe("ok");
		expect(result["test.com"]).toBe("ok");

		// Preserve the delegated result contract.
		expect(Object.getPrototypeOf(result)).toBeNull();
		expect(Reflect.get(result, "__proto__")).toBeUndefined();
	});
});
