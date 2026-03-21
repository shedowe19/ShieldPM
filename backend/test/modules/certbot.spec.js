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

	// ── requestCertbot ──────────────────────────────────────────────────

	describe("requestCertbot", () => {
		it("should call certbot certonly with correct args", async () => {
			const { requestCertbot } = await import("../../modules/certbot/service.js");
			const utils = (await import("../../lib/utils.js")).default;
			const cert = { id: 1, domain_names: ["test.com"] };
			const result = await requestCertbot(cert);
			expect(result).toBe("certbot output");
			expect(utils.execFile).toHaveBeenCalledWith(
				"certbot",
				expect.arrayContaining(["certonly", "--cert-name", "npm-1"]),
			);
		});

		it("should join multiple domains with comma", async () => {
			const { requestCertbot } = await import("../../modules/certbot/service.js");
			const utils = (await import("../../lib/utils.js")).default;
			const cert = { id: 2, domain_names: ["a.com", "b.com"] };
			await requestCertbot(cert);
			const args = utils.execFile.mock.calls.find((c) => c[0] === "certbot")?.[1];
			expect(args).toContain("a.com,b.com");
		});

		it("should use webroot authenticator", async () => {
			const { requestCertbot } = await import("../../modules/certbot/service.js");
			const utils = (await import("../../lib/utils.js")).default;
			await requestCertbot({ id: 1, domain_names: ["x.com"] });
			const args = utils.execFile.mock.calls.find((c) => c[0] === "certbot")?.[1];
			expect(args).toContain("webroot");
		});
	});

	// ── renewCertbot ────────────────────────────────────────────────────

	describe("renewCertbot", () => {
		it("should call certbot renew with force-renewal", async () => {
			const { renewCertbot } = await import("../../modules/certbot/service.js");
			const utils = (await import("../../lib/utils.js")).default;
			const cert = { id: 1, domain_names: ["test.com"] };
			const result = await renewCertbot(cert);
			expect(result).toBe("certbot output");
			expect(utils.execFile).toHaveBeenCalledWith(
				"certbot",
				expect.arrayContaining(["renew", "--force-renewal", "--cert-name", "npm-1"]),
			);
		});

		it("should throw when another process is running", async () => {
			const { renewCertbot } = await import("../../modules/certbot/service.js");
			const utils = (await import("../../lib/utils.js")).default;
			// Make the first call hang
			let resolveFirst;
			utils.execFile.mockImplementationOnce(
				() =>
					new Promise((r) => {
						resolveFirst = r;
					}),
			);
			const first = renewCertbot({ id: 1, domain_names: ["a.com"] });
			// Second call should fail
			await expect(renewCertbot({ id: 2, domain_names: ["b.com"] })).rejects.toThrow("currently running");
			resolveFirst("done");
			await first;
		});

		it("should reset processing flag after completion", async () => {
			const { renewCertbot, isProcessing } = await import("../../modules/certbot/service.js");
			await renewCertbot({ id: 1, domain_names: ["test.com"] });
			expect(isProcessing()).toBe(false);
		});
	});

	// ── revokeCertbot ───────────────────────────────────────────────────

	describe("revokeCertbot", () => {
		it("should call certbot revoke and cleanup der file", async () => {
			const { revokeCertbot } = await import("../../modules/certbot/service.js");
			const _utils = (await import("../../lib/utils.js")).default;
			const fs = (await import("node:fs")).default;
			const cert = { id: 1, domain_names: ["test.com"] };
			const result = await revokeCertbot(cert);
			expect(result).toBe("certbot output");
			expect(fs.rmSync).toHaveBeenCalledWith(expect.stringContaining("npm-1.der"), { force: true });
		});

		it("should not throw on error when throwErrors is false", async () => {
			const { revokeCertbot } = await import("../../modules/certbot/service.js");
			const utils = (await import("../../lib/utils.js")).default;
			utils.execFile.mockRejectedValueOnce(new Error("revoke failed"));
			const result = await revokeCertbot({ id: 1, domain_names: ["test.com"] }, false);
			expect(result).toBeUndefined();
		});

		it("should throw on error when throwErrors is true", async () => {
			const { revokeCertbot } = await import("../../modules/certbot/service.js");
			const utils = (await import("../../lib/utils.js")).default;
			utils.execFile.mockRejectedValueOnce(new Error("revoke failed"));
			await expect(revokeCertbot({ id: 1, domain_names: ["test.com"] }, true)).rejects.toThrow("revoke failed");
		});
	});

	// ── requestCertbotWithDnsChallenge ───────────────────────────────────

	describe("requestCertbotWithDnsChallenge", () => {
		it("should use dns plugin for known provider", async () => {
			const { requestCertbotWithDnsChallenge } = await import("../../modules/certbot/service.js");
			const _utils = (await import("../../lib/utils.js")).default;
			const { installPlugin } = await import("../../lib/certbot.js");
			const cert = {
				id: 1,
				domain_names: ["test.com"],
				meta: { dns_provider: "cloudflare", dns_provider_credentials: "api_key=xxx" },
			};
			const result = await requestCertbotWithDnsChallenge(cert);
			expect(result).toBe("certbot output");
			expect(installPlugin).toHaveBeenCalledWith("cloudflare");
		});

		it("should throw for unknown dns provider", async () => {
			const { requestCertbotWithDnsChallenge } = await import("../../modules/certbot/service.js");
			const cert = {
				id: 1,
				domain_names: ["test.com"],
				meta: { dns_provider: "unknown_provider", dns_provider_credentials: "x" },
			};
			await expect(requestCertbotWithDnsChallenge(cert)).rejects.toThrow("Unknown DNS provider");
		});

		it("should write credentials file", async () => {
			const { requestCertbotWithDnsChallenge } = await import("../../modules/certbot/service.js");
			const fs = (await import("node:fs")).default;
			const cert = {
				id: 3,
				domain_names: ["test.com"],
				meta: { dns_provider: "cloudflare", dns_provider_credentials: "token=abc" },
			};
			await requestCertbotWithDnsChallenge(cert);
			expect(fs.writeFileSync).toHaveBeenCalledWith(
				expect.stringContaining("credentials-3"),
				"token=abc",
				expect.objectContaining({ mode: 0o600 }),
			);
		});
	});

	// ── renewCertbotWithDnsChallenge ─────────────────────────────────────

	describe("renewCertbotWithDnsChallenge", () => {
		it("should call certbot renew for dns challenge", async () => {
			const { renewCertbotWithDnsChallenge } = await import("../../modules/certbot/service.js");
			const _utils = (await import("../../lib/utils.js")).default;
			const cert = {
				id: 1,
				domain_names: ["test.com"],
				meta: { dns_provider: "cloudflare" },
			};
			const result = await renewCertbotWithDnsChallenge(cert);
			expect(result).toBe("certbot output");
		});

		it("should throw for unknown dns provider", async () => {
			const { renewCertbotWithDnsChallenge } = await import("../../modules/certbot/service.js");
			const cert = {
				id: 1,
				domain_names: ["test.com"],
				meta: { dns_provider: "nope" },
			};
			await expect(renewCertbotWithDnsChallenge(cert)).rejects.toThrow("Unknown DNS provider");
		});

		it("should reset processing flag even on failure", async () => {
			const { renewCertbotWithDnsChallenge, isProcessing } = await import("../../modules/certbot/service.js");
			const utils = (await import("../../lib/utils.js")).default;
			utils.execFile.mockRejectedValueOnce(new Error("renew fail"));
			const cert = {
				id: 1,
				domain_names: ["test.com"],
				meta: { dns_provider: "cloudflare" },
			};
			try {
				await renewCertbotWithDnsChallenge(cert);
			} catch {}
			expect(isProcessing()).toBe(false);
		});
	});
});
