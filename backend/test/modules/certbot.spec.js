import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
	default: {
		mkdirSync: vi.fn(),
		writeFileSync: vi.fn(),
		unlinkSync: vi.fn(),
		rmSync: vi.fn(),
	},
}));

vi.mock("node:https", () => {
	const request = vi.fn((_url, _options, cb) => {
		const res = {
			statusCode: 200,
			on: (event, handler) => {
				if (event === "data") handler(JSON.stringify({ responsecode: "200", htmlresponse: "Success" }));
				if (event === "end") handler();
			},
		};
		cb(res);
		return { write: vi.fn(), end: vi.fn(), on: vi.fn() };
	});
	return { default: { request }, request };
});

vi.mock("proxy-agent", () => ({ ProxyAgent: vi.fn() }));

vi.mock("../../lib/utils.js", () => ({
	default: {
		execFile: vi.fn().mockResolvedValue("certbot output"),
	},
}));

vi.mock("../../lib/certbot.js", () => ({
	installPlugin: vi.fn().mockResolvedValue(),
}));

vi.mock("../../logger.js", () => ({
	ssl: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), success: vi.fn() },
	debug: vi.fn(),
}));

vi.mock("../../certbot/dns-plugins.json", () => ({
	default: {
		cloudflare: {
			name: "Cloudflare",
			full_plugin_name: null,
		},
	},
}));

vi.mock("../../package.json", () => ({ default: { version: "4.2.0" } }));

import { getLiveCertPath, getArchiveCertPath, getRenewalConfigPath } from "../../modules/certbot/paths.js";

describe("certbot module", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── paths ───────────────────────────────────────────────────────────

	describe("getLiveCertPath", () => {
		it("should return correct live cert path", () => {
			expect(getLiveCertPath(5)).toBe("/etc/letsencrypt/live/npm-5");
		});

		it("should handle string ids", () => {
			expect(getLiveCertPath("10")).toBe("/etc/letsencrypt/live/npm-10");
		});
	});

	describe("getArchiveCertPath", () => {
		it("should return correct archive cert path", () => {
			expect(getArchiveCertPath(5)).toBe("/etc/letsencrypt/archive/npm-5");
		});
	});

	describe("getRenewalConfigPath", () => {
		it("should return correct renewal config path", () => {
			expect(getRenewalConfigPath(5)).toBe("/etc/letsencrypt/renewal/npm-5.conf");
		});
	});

	// ── isProcessing ────────────────────────────────────────────────────

	describe("isProcessing", () => {
		it("should return false initially", async () => {
			const { isProcessing } = await import("../../modules/certbot/service.js");
			expect(isProcessing()).toBe(false);
		});
	});

	// ── performTestForDomain ────────────────────────────────────────────

	describe("performTestForDomain", () => {
		it("should return ok when challenge test succeeds", async () => {
			const { performTestForDomain } = await import("../../modules/certbot/service.js");
			const result = await performTestForDomain("example.com");
			expect(result).toBe("ok");
		});
	});

	// ── testHttpsChallenge ──────────────────────────────────────────────

	describe("testHttpsChallenge", () => {
		it("should test each domain and return null-prototype object", async () => {
			const { testHttpsChallenge } = await import("../../modules/certbot/service.js");
			const mockAccess = { can: vi.fn().mockResolvedValue(true) };
			const result = await testHttpsChallenge(mockAccess, {
				domains: ["a.com", "b.com"],
			});
			expect(result["a.com"]).toBe("ok");
			expect(result["b.com"]).toBe("ok");
			expect(Object.getPrototypeOf(result)).toBeNull();
		});

		it("should verify access permission", async () => {
			const { testHttpsChallenge } = await import("../../modules/certbot/service.js");
			const mockAccess = { can: vi.fn().mockResolvedValue(true) };
			await testHttpsChallenge(mockAccess, { domains: ["test.com"] });
			expect(mockAccess.can).toHaveBeenCalledWith("certificates:list");
		});
	});
});
