import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execFile: vi.fn(),
	requests: [],
	policy: vi.fn().mockResolvedValue("standard"),
	runtime: vi.fn(),
	validate: vi.fn(),
	issuer: vi.fn(),
	account: vi.fn(),
	cleanup: vi.fn(),
	options: vi.fn().mockResolvedValue({ key_type: "ecdsa", renewal_interval_hours: 12 }),
}));
vi.mock("../../internal/acme-profile.js", () => ({
	default: { getPolicy: mocks.policy, validatePolicyForServer: mocks.validate },
}));
vi.mock("../../internal/acme-options.js", () => ({ default: { getRuntimePolicy: mocks.runtime } }));
vi.mock("../../internal/acme-runtime.js", () => ({
	getCertificateIssuer: mocks.issuer,
	ensureAcmeAccount: mocks.account,
	createAcmeConfig: vi.fn(async () => ({
		filename: "/private/config.ini",
		secrets: [],
		cleanup: mocks.cleanup,
		exec: (args) => mocks.execFile("certbot", ["--config", "/private/config.ini", ...args]),
	})),
}));
vi.mock("../../internal/certificate-options.js", () => ({ default: { getPolicy: mocks.options } }));
vi.mock("../../lib/utils.js", () => ({ default: { execFile: mocks.execFile } }));
vi.mock("../../lib/certbot.js", () => ({ installPlugin: vi.fn() }));
vi.mock("proxy-agent", () => ({ ProxyAgent: class {} }));
vi.mock("node:https", async () => {
	const { EventEmitter } = await import("node:events");
	return {
		default: {
			request: vi.fn((_url, _options, callback) => {
				const request = new EventEmitter();
				request.write = vi.fn();
				request.setTimeout = vi.fn();
				request.destroy = vi.fn();
				request.end = () =>
					queueMicrotask(() => {
						const response = new EventEmitter();
						response.statusCode = 200;
						callback(response);
						response.emit("data", JSON.stringify({ responsecode: "200", htmlresponse: "Success" }));
						response.emit("end");
					});
				mocks.requests.push(request);
				return request;
			}),
		},
	};
});

import {
	isProcessing,
	renewCertbot,
	renewCertbotWithDnsChallenge,
	requestCertbot,
	requestCertbotWithDnsChallenge,
	revokeCertbot,
	runCertbot,
	testHttpsChallenge,
} from "../../internal/certbot.js";
import { installPlugin } from "../../lib/certbot.js";

const certificate = { id: 1, domain_names: ["example.test"], meta: {} };

describe("Certbot process coordination", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.policy.mockResolvedValue("standard");
		certificate.meta = {};
		mocks.runtime.mockResolvedValue({
			server: "https://new-ca.example.test/directory",
			server_tls_verify: true,
			agree_tos: true,
			must_staple: false,
		});
		mocks.issuer.mockResolvedValue({ server: "https://old-ca.example.test/directory", account: "old-account" });
		mocks.account.mockResolvedValue("old-account");
		mocks.options.mockResolvedValue({ key_type: "ecdsa", renewal_interval_hours: 12 });
		mocks.requests.length = 0;
	});
	it.each([requestCertbot, requestCertbotWithDnsChallenge, renewCertbot, renewCertbotWithDnsChallenge])(
		"uses the saved key type and ignores stale environment options in %s",
		async (operation) => {
			vi.stubEnv("ACME_KEY_TYPE", "ecdsa");
			vi.spyOn(fs.promises, "mkdir").mockResolvedValue();
			vi.spyOn(fs.promises, "writeFile").mockResolvedValue();
			vi.spyOn(fs.promises, "chmod").mockResolvedValue();
			mocks.execFile.mockResolvedValue("issued");
			mocks.options.mockResolvedValue({ key_type: "rsa", renewal_interval_hours: 3 });
			await operation({
				...certificate,
				meta: { dns_provider: "cloudflare", dns_provider_credentials: "synthetic-credential" },
			});
			const args = mocks.execFile.mock.calls[0][1];
			expect(args.slice(args.indexOf("--key-type"), args.indexOf("--key-type") + 2)).toEqual([
				"--key-type",
				"rsa",
			]);
			expect(mocks.options).toHaveBeenCalledOnce();
		},
	);
	it("releases the lock when saved key options cannot be read, before DNS plugin changes", async () => {
		mocks.options.mockRejectedValueOnce(new Error("invalid saved options"));
		await expect(
			requestCertbotWithDnsChallenge({
				...certificate,
				meta: { dns_provider: "cloudflare", dns_provider_credentials: "synthetic-credential" },
			}),
		).rejects.toThrow("invalid saved options");
		expect(installPlugin).not.toHaveBeenCalled();
		expect(mocks.execFile).not.toHaveBeenCalled();
		expect(isProcessing()).toBe(false);
	});
	it("uses saved CA options for new issuance and records server-owned account bindings", async () => {
		vi.stubEnv("ACME_SERVER", "https://obsolete-env.example.test/directory");
		mocks.execFile.mockResolvedValue("issued");
		const row = { ...certificate, meta: {} };
		await requestCertbot(row);
		const args = mocks.execFile.mock.calls[0][1];
		expect(args).toEqual(
			expect.arrayContaining(["--server", "https://new-ca.example.test/directory", "--account", "old-account"]),
		);
		expect(row.meta).toMatchObject({
			acme_server: "https://new-ca.example.test/directory",
			acme_account: "old-account",
		});
		expect(mocks.issuer).not.toHaveBeenCalled();
		expect(mocks.cleanup).toHaveBeenCalledOnce();
	});
	it.each([renewCertbot, renewCertbotWithDnsChallenge, revokeCertbot])(
		"keeps the original issuer and account after global CA changes in %s",
		async (operation) => {
			mocks.execFile.mockResolvedValue("complete");
			vi.spyOn(fs, "rmSync").mockImplementation(() => {});
			const row = { ...certificate, meta: { dns_provider: "cloudflare" } };
			await operation(row);
			expect(mocks.execFile.mock.calls[0][1]).toEqual(
				expect.arrayContaining([
					"--server",
					"https://old-ca.example.test/directory",
					"--account",
					"old-account",
				]),
			);
			expect(mocks.account.mock.calls[0][2]).toEqual({
				server: "https://old-ca.example.test/directory",
				account: "old-account",
			});
			expect(row.meta.acme_server).toBeUndefined();
			expect(mocks.cleanup).toHaveBeenCalledOnce();
		},
	);
	it("verifies shortlived against the original issuer, and cleans private files after command failure", async () => {
		mocks.execFile.mockRejectedValueOnce(new Error("synthetic issuance failure"));
		await expect(renewCertbot({ ...certificate, meta: { letsencrypt_profile: "shortlived" } })).rejects.toThrow(
			"synthetic issuance failure",
		);
		expect(mocks.validate).toHaveBeenCalledExactlyOnceWith(
			"https://old-ca.example.test/directory",
			true,
			"shortlived",
		);
		expect(mocks.cleanup).toHaveBeenCalledOnce();
		expect(isProcessing()).toBe(false);
	});
	it("rejects unsupported Must-Staple for original Let's Encrypt lineages before account changes", async () => {
		mocks.runtime.mockResolvedValue({ server: "https://new-ca.example.test/directory", must_staple: true });
		mocks.issuer.mockResolvedValue({
			server: "https://acme-v02.api.letsencrypt.org/directory",
			account: "old-account",
		});
		await expect(renewCertbot({ ...certificate, meta: {} })).rejects.toThrow("no longer supports Must-Staple");
		expect(mocks.account).not.toHaveBeenCalled();
		expect(mocks.execFile).not.toHaveBeenCalled();
		expect(isProcessing()).toBe(false);
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it.each([requestCertbot, renewCertbot, renewCertbotWithDnsChallenge])(
		"requires the selected shortlived profile for %s",
		async (operation) => {
			mocks.execFile.mockResolvedValue("issued");
			await operation({
				...certificate,
				meta: { letsencrypt_profile: "shortlived", dns_provider: "cloudflare" },
			});
			const args = mocks.execFile.mock.calls[0][1];
			expect(args.slice(args.indexOf("--required-profile"))).toEqual(["--required-profile", "shortlived"]);
			expect(args).not.toContain("--preferred-profile");
		},
	);
	it("ignores an obsolete environment profile for a default Standard request", async () => {
		vi.stubEnv("ACME_PROFILE", "shortlived");
		mocks.execFile.mockResolvedValue("issued");
		await requestCertbot(certificate);
		const args = mocks.execFile.mock.calls[0][1];
		expect(args.slice(args.indexOf("--required-profile"))).toEqual([
			"--required-profile",
			"",
			"--preferred-profile",
			"",
		]);
	});
	it.each([renewCertbot, renewCertbotWithDnsChallenge])(
		"uses the saved global profile for legacy certificates in %s",
		async (operation) => {
			mocks.execFile.mockResolvedValue("renewed");
			mocks.policy.mockResolvedValueOnce("standard");
			await operation({ ...certificate, meta: { dns_provider: "cloudflare" } });
			const standardArgs = mocks.execFile.mock.calls[0][1];
			expect(standardArgs.slice(standardArgs.indexOf("--required-profile"))).toEqual([
				"--required-profile",
				"",
				"--preferred-profile",
				"",
			]);
			mocks.policy.mockResolvedValueOnce("shortlived");
			await operation({ ...certificate, meta: { dns_provider: "cloudflare" } });
			expect(mocks.execFile.mock.calls[1][1]).toEqual(
				expect.arrayContaining(["--required-profile", "shortlived"]),
			);
		},
	);
	it.each([requestCertbot, renewCertbot, renewCertbotWithDnsChallenge])(
		"clears obsolete configuration and lineage profiles for explicit standard in %s",
		async (operation) => {
			mocks.execFile.mockResolvedValue("issued");
			await operation({ ...certificate, meta: { letsencrypt_profile: "standard", dns_provider: "cloudflare" } });
			const args = mocks.execFile.mock.calls[0][1];
			expect(args.slice(args.indexOf("--required-profile"))).toEqual([
				"--required-profile",
				"",
				"--preferred-profile",
				"",
			]);
		},
	);
	it("passes shortlived to DNS issuance while retaining plugin options", async () => {
		vi.spyOn(fs.promises, "mkdir").mockResolvedValue();
		vi.spyOn(fs.promises, "writeFile").mockResolvedValue();
		vi.spyOn(fs.promises, "chmod").mockResolvedValue();
		mocks.execFile.mockResolvedValue("issued");
		await requestCertbotWithDnsChallenge({
			...certificate,
			meta: {
				letsencrypt_profile: "shortlived",
				dns_provider: "cloudflare",
				dns_provider_credentials: "synthetic-credential",
			},
		});
		expect(mocks.execFile.mock.calls[0][1]).toEqual(expect.arrayContaining(["--required-profile", "shortlived"]));
	});
	it("rejects unknown profiles before running Certbot or installing plugins", async () => {
		await expect(requestCertbot({ ...certificate, meta: { letsencrypt_profile: "unknown" } })).rejects.toThrow(
			"Certificate profile must be",
		);
		await expect(
			requestCertbotWithDnsChallenge({
				...certificate,
				meta: {
					letsencrypt_profile: "unknown",
					dns_provider: "cloudflare",
					dns_provider_credentials: "synthetic-credential",
				},
			}),
		).rejects.toThrow("Certificate profile must be");
		expect(mocks.execFile).not.toHaveBeenCalled();
		expect(installPlugin).not.toHaveBeenCalled();
		expect(isProcessing()).toBe(false);
	});

	it("serializes requests and manual or scheduled renewal through one lock", async () => {
		let release;
		mocks.execFile.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		const request = requestCertbot(certificate);
		expect(isProcessing()).toBe(true);
		await expect(renewCertbot(certificate)).rejects.toThrow("Another Certbot process");
		await expect(runCertbot(["renew"])).rejects.toThrow("Another Certbot process");
		await vi.waitFor(() => expect(release).toBeTypeOf("function"));
		release("created");
		await request;
		expect(isProcessing()).toBe(false);
		expect(mocks.execFile).toHaveBeenCalledOnce();
	});

	it("releases the process lock on command failure", async () => {
		mocks.execFile.mockRejectedValueOnce(new Error("ACME failed"));
		await expect(runCertbot(["renew"])).rejects.toThrow("ACME failed");
		expect(isProcessing()).toBe(false);
		mocks.execFile.mockResolvedValueOnce("renewed");
		await expect(runCertbot(["renew"])).resolves.toBe("renewed");
	});
	it("reserves Certbot before detaching a revoked certificate and propagates preparation errors", async () => {
		const prepare = vi.fn(async () => {
			expect(isProcessing()).toBe(true);
			throw new Error("detachment failed");
		});
		await expect(revokeCertbot(certificate, true, prepare)).rejects.toThrow("detachment failed");
		expect(prepare).toHaveBeenCalledOnce();
		expect(mocks.execFile).not.toHaveBeenCalled();
		expect(isProcessing()).toBe(false);
	});
	it("locks DNS plugin installation and credentials before they can race renewal", async () => {
		let release;
		installPlugin.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		vi.spyOn(fs.promises, "mkdir").mockResolvedValue();
		vi.spyOn(fs.promises, "writeFile").mockResolvedValue();
		vi.spyOn(fs.promises, "chmod").mockResolvedValue();
		mocks.execFile.mockResolvedValue("created");
		const pending = requestCertbotWithDnsChallenge({
			...certificate,
			meta: {
				dns_provider: "mijnhost",
				dns_provider_credentials: "synthetic-credential",
				propagation_seconds: 0,
			},
		});
		expect(isProcessing()).toBe(true);
		await expect(renewCertbot(certificate)).rejects.toThrow("Another Certbot process");
		expect(fs.promises.writeFile).not.toHaveBeenCalled();
		await vi.waitFor(() => expect(release).toBeTypeOf("function"));
		release();
		await pending;
		const args = mocks.execFile.mock.calls[0][1];
		expect(args).toContain("--dns-mijn-host-credentials");
		expect(args).toContain("--dns-mijn-host-propagation-seconds");
		expect(args).toContain("0");
		expect(isProcessing()).toBe(false);
	});
	it("releases the DNS operation lock when installation fails", async () => {
		installPlugin.mockRejectedValueOnce(new Error("pip failed"));
		await expect(
			requestCertbotWithDnsChallenge({
				...certificate,
				meta: {
					dns_provider: "cloudflare",
					dns_provider_credentials: "synthetic-credential",
				},
			}),
		).rejects.toThrow("pip failed");
		expect(mocks.execFile).not.toHaveBeenCalled();
		expect(isProcessing()).toBe(false);
	});
	it.each(["__proto__", "constructor", "unknown"])(
		"rejects unknown provider %s before installation",
		async (provider) => {
			await expect(
				requestCertbotWithDnsChallenge({ ...certificate, meta: { dns_provider: provider } }),
			).rejects.toThrow("Unknown DNS provider");
			expect(installPlugin).not.toHaveBeenCalled();
		},
	);

	it("uses separate files for concurrent challenge tests and cleans both up", async () => {
		vi.spyOn(fs.promises, "mkdir").mockResolvedValue();
		vi.spyOn(fs.promises, "writeFile").mockResolvedValue();
		vi.spyOn(fs.promises, "rm").mockResolvedValue();
		const access = { can: vi.fn().mockResolvedValue() };
		const results = await Promise.all([
			testHttpsChallenge(access, { domains: ["one.test"] }),
			testHttpsChallenge(access, { domains: ["two.test"] }),
		]);
		const paths = fs.promises.writeFile.mock.calls.map(([path]) => path);
		expect(new Set(paths).size).toBe(2);
		expect(results[0]["one.test"]).toBe("ok");
		expect(Object.getPrototypeOf(results[0])).toBeNull();
		for (const path of paths) expect(fs.promises.rm).toHaveBeenCalledWith(path, { force: true });
		for (const request of mocks.requests)
			expect(request.setTimeout).toHaveBeenCalledWith(15000, expect.any(Function));
	});
});
