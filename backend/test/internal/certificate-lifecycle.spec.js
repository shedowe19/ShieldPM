import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	query: vi.fn(),
	reload: vi.fn(),
	audit: vi.fn(),
	proxyQuery: vi.fn(),
	deadQuery: vi.fn(),
	redirectQuery: vi.fn(),
	streamQuery: vi.fn(),
	generateConfig: vi.fn(),
	deleteConfig: vi.fn(),
}));
vi.mock("../../models/certificate.js", () => ({ default: { query: mocks.query } }));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: mocks.proxyQuery } }));
vi.mock("../../models/dead_host.js", () => ({ default: { query: mocks.deadQuery } }));
vi.mock("../../models/redirection_host.js", () => ({ default: { query: mocks.redirectQuery } }));
vi.mock("../../models/stream.js", () => ({ default: { query: mocks.streamQuery } }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: mocks.audit } }));
vi.mock("../../internal/nginx.js", () => ({
	default: { reload: mocks.reload, generateConfig: mocks.generateConfig, deleteConfig: mocks.deleteConfig },
}));
vi.mock("../../internal/certbot.js", () => ({ renewCertbot: vi.fn().mockResolvedValue("renewed") }));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: vi.fn() } }));
vi.mock("../../internal/pki.js", () => ({ default: {} }));

import internalCertificate from "../../internal/certificate.js";
import utils from "../../lib/utils.js";

const access = () => ({
	can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
	token: { getUserId: () => 1 },
});
const queryFor = (row) => {
	const query = Object.assign(Promise.resolve(row), {
		where: vi.fn().mockReturnThis(),
		andWhere: vi.fn().mockReturnThis(),
		allowGraph: vi.fn().mockReturnThis(),
		first: vi.fn().mockReturnThis(),
	});
	return query;
};

describe("certificate lifecycle regressions", () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		vi.useRealTimers();
	});

	it("redacts private material on certificate retrieval without modifying the stored metadata", async () => {
		const meta = {
			certificate: "PEM",
			certificate_key: "PRIVATE",
			dns_provider_credentials: "DNS_SECRET",
			dns_challenge: true,
		};
		mocks.query.mockReturnValue(queryFor({ id: 2, meta }));
		const result = await internalCertificate.get(access(), { id: 2, omit: ["nice_name"] });
		expect(result.meta).toEqual({ certificate: true, certificate_key: true, dns_challenge: true });
		expect(meta.certificate_key).toBe("PRIVATE");
	});

	it("removes connection credentials from expanded proxy hosts even with custom omissions", async () => {
		mocks.query.mockReturnValue(
			queryFor({
				id: 2,
				meta: {},
				proxy_hosts: [
					{
						id: 1,
						terminal_password: "ciphertext",
						terminal_private_key: "private-key",
						git_credentials: "git-secret",
					},
				],
			}),
		);
		const result = await internalCertificate.get(access(), { id: 2, omit: ["nice_name"] });
		expect(result.proxy_hosts).toEqual([{ id: 1 }]);
	});

	it("keeps domain and access-list relations during orphan cleanup and never regenerates disabled hosts", async () => {
		const active = {
			id: 1,
			enabled: true,
			certificate_id: 99,
			meta: {},
			domain_names: ["protected.test"],
			access_list: { items: [{ username: "admin" }], clients: [{ directive: "deny", address: "all" }] },
		};
		const disabled = { id: 2, enabled: false, certificate_id: 99, meta: {} };
		const proxyQuery = Object.assign(Promise.resolve([active, disabled]), {
			where: vi.fn().mockReturnThis(),
			andWhere: vi.fn().mockReturnThis(),
			patch: vi.fn().mockResolvedValue(1),
			findById: vi.fn((id) =>
				Object.assign(Promise.resolve({ ...(id === 1 ? active : disabled), certificate_id: 0 }), {
					withGraphFetched: vi.fn().mockReturnThis(),
				}),
			),
		});
		mocks.proxyQuery.mockReturnValue(proxyQuery);
		for (const query of [mocks.deadQuery, mocks.redirectQuery, mocks.streamQuery])
			query.mockReturnValue(queryFor([]));
		const certificates = queryFor([]);
		certificates.select = vi.fn().mockReturnValue(certificates);
		mocks.query.mockReturnValue(certificates);
		await internalCertificate.cleanUpMissingCertificates();
		expect(mocks.generateConfig).toHaveBeenCalledTimes(1);
		expect(mocks.generateConfig).toHaveBeenCalledWith(
			"proxy_host",
			expect.objectContaining({ id: 1, domain_names: ["protected.test"], access_list: active.access_list }),
		);
		expect(proxyQuery.findById.mock.results[0].value.withGraphFetched).toHaveBeenCalledWith(
			"[host_domains,access_list.[clients,items]]",
		);
		expect(mocks.deleteConfig).toHaveBeenCalledWith("proxy_host", expect.objectContaining({ id: 2 }));
		expect(mocks.reload).toHaveBeenCalledOnce();
		expect(proxyQuery.patch).toHaveBeenCalledWith({ meta: { nginx_online: false, nginx_err: null } });
	});

	it("reloads nginx after manual renewal and redacts the result and audit event", async () => {
		const certificate = { id: 2, provider: "letsencrypt", meta: {} };
		vi.spyOn(internalCertificate, "get").mockResolvedValue(certificate);
		vi.spyOn(internalCertificate, "getLiveCertPath").mockReturnValue("/mock/cert");
		vi.spyOn(internalCertificate, "getCertificateInfoFromFile").mockResolvedValue({ dates: { to: 1800000000 } });
		mocks.query.mockReturnValue({
			patchAndFetchById: vi
				.fn()
				.mockResolvedValue({ ...certificate, meta: { dns_provider_credentials: "DNS_SECRET" } }),
		});
		const permissions = access();
		const result = await internalCertificate.renew(permissions, { id: 2 });
		expect(permissions.can).toHaveBeenCalledWith("certificates:update", 2);
		expect(mocks.reload).toHaveBeenCalledOnce();
		expect(result.meta.dns_provider_credentials).toBeUndefined();
		expect(mocks.audit.mock.calls[0][1].meta.meta.dns_provider_credentials).toBeUndefined();
	});

	it.each(["0", "-1", "1000000", "12hours", ""])(
		"uses safe renewal interval for CRT=%s and replaces existing timers",
		async (value) => {
			vi.useFakeTimers();
			vi.stubEnv("CRT", value);
			vi.spyOn(internalCertificate, "processExpiringHosts").mockResolvedValue();
			vi.spyOn(internalCertificate, "cleanUpMissingCertificates").mockResolvedValue();
			const interval = vi.spyOn(globalThis, "setInterval");
			await internalCertificate.initTimer();
			await internalCertificate.initTimer();
			expect(interval).toHaveBeenLastCalledWith(internalCertificate.processExpiringHosts, 72 * 3600000);
			expect(vi.getTimerCount()).toBe(1);
			clearInterval(internalCertificate.interval);
		},
	);

	it("validates private keys in memory and rejects encrypted keys immediately", async () => {
		const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
		const pem = privateKey.export({ type: "pkcs8", format: "pem" });
		const encrypted = privateKey.export({
			type: "pkcs8",
			format: "pem",
			cipher: "aes-256-cbc",
			passphrase: "test-passphrase",
		});
		await expect(internalCertificate.checkPrivateKey(pem)).resolves.toBe(true);
		await expect(internalCertificate.checkPrivateKey(encrypted)).rejects.toThrow("Certificate Key is not valid");
	});

	it("extracts the common name after organization fields and parses certificate dates in GMT", async () => {
		vi.stubEnv("TZ", "America/New_York");
		vi.spyOn(utils, "execFile").mockImplementation(async (_command, args) => {
			if (args.includes("-subject")) return "subject=C = US, O = Example Org, CN = proxy.example.test";
			if (args.includes("-issuer")) return "issuer=CN = Example CA";
			if (args.includes("-ext")) return "X509v3 Subject Alternative Name:\n    DNS:proxy.example.test";
			return "notBefore=Jul 14 04:04:29 2026 GMT\nnotAfter=Oct 12 04:04:29 2026 GMT";
		});
		const info = await internalCertificate.getCertificateInfoFromFile("/mock/cert.pem");
		expect(info.cn).toBe("proxy.example.test");
		expect(info.dates.to).toBe(Date.UTC(2026, 9, 12, 4, 4, 29) / 1000);
	});
});
