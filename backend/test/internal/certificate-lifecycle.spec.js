import { generateKeyPairSync, X509Certificate } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rootCertificates } from "node:tls";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	query: vi.fn(),
	runCertbot: vi.fn(),
	configurationLock: vi.fn(),
	backupConfig: vi.fn(),
	restoreConfig: vi.fn(),
	deleteBackupConfig: vi.fn(),
	reload: vi.fn(),
	audit: vi.fn(),
	proxyQuery: vi.fn(),
	deadQuery: vi.fn(),
	redirectQuery: vi.fn(),
	streamQuery: vi.fn(),
	generateConfig: vi.fn(),
	deleteConfig: vi.fn(),
	createLeadCert: vi.fn(),
	gitops: vi.fn(),
}));
vi.mock("../../models/certificate.js", () => ({ default: { query: mocks.query } }));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: mocks.proxyQuery } }));
vi.mock("../../models/dead_host.js", () => ({ default: { query: mocks.deadQuery } }));
vi.mock("../../models/redirection_host.js", () => ({ default: { query: mocks.redirectQuery } }));
vi.mock("../../models/stream.js", () => ({ default: { query: mocks.streamQuery } }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: mocks.audit } }));
vi.mock("../../internal/nginx.js", () => ({
	default: {
		reload: mocks.reload,
		generateConfig: mocks.generateConfig,
		deleteConfig: mocks.deleteConfig,
		withConfigurationLock: mocks.configurationLock,
		backupConfig: mocks.backupConfig,
		restoreConfig: mocks.restoreConfig,
		deleteBackupConfig: mocks.deleteBackupConfig,
	},
}));
vi.mock("../../internal/certbot.js", () => ({
	renewCertbot: vi.fn().mockResolvedValue("renewed"),
	runCertbot: mocks.runCertbot,
}));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: mocks.gitops } }));
vi.mock("../../internal/pki.js", () => ({ default: { createLeadCert: mocks.createLeadCert } }));

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
	const temporaryDirs = [];
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.configurationLock.mockImplementation(async (operation) => operation());
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		vi.useRealTimers();
		for (const directory of temporaryDirs.splice(0))
			await fs.promises.rm(directory, { recursive: true, force: true });
	});

	const mockCertificateDirectory = async () => {
		const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "shieldpm-cert-test-"));
		temporaryDirs.push(directory);
		const realDirectory = path.join(directory, "npm-2");
		await fs.promises.mkdir(realDirectory);
		await fs.promises.writeFile(path.join(realDirectory, "fullchain.pem"), "old-certificate");
		await fs.promises.writeFile(path.join(realDirectory, "privkey.pem"), "old-key");
		const remap = (filename) => filename.replace("/data/tls/custom", directory);
		for (const method of ["mkdir", "mkdtemp", "writeFile", "rm"]) {
			const original = fs.promises[method].bind(fs.promises);
			vi.spyOn(fs.promises, method).mockImplementation((filename, ...args) => original(remap(filename), ...args));
		}
		const rename = fs.promises.rename.bind(fs.promises);
		vi.spyOn(fs.promises, "rename").mockImplementation((from, to) => rename(remap(from), remap(to)));
		return { directory, realDirectory };
	};

	it("rejects absent certificate domains before database writes", async () => {
		await expect(internalCertificate.create(access(), { provider: "internal" })).rejects.toThrow(
			"At least one domain",
		);
		expect(mocks.query).not.toHaveBeenCalled();
	});
	it("prevents provider changes from redirecting existing certificate paths", async () => {
		vi.spyOn(internalCertificate, "get").mockResolvedValue({ id: 2, provider: "letsencrypt", meta: {} });
		await expect(internalCertificate.update(access(), { id: 2, provider: "other" })).rejects.toThrow(
			"provider cannot be changed",
		);
		expect(mocks.query).not.toHaveBeenCalled();
	});
	it("keeps an issued internal certificate when audit persistence fails", async () => {
		const row = { id: 2, provider: "internal", domain_names: ["test.example"], meta: {} };
		const query = {
			insertAndFetch: vi.fn().mockResolvedValue(row),
			patchAndFetchById: vi.fn().mockResolvedValue(row),
			deleteById: vi.fn(),
		};
		mocks.query.mockReturnValue(query);
		mocks.createLeadCert.mockResolvedValue({ fullchain: "/mock/fullchain.pem", privkey: "/mock/privkey.pem" });
		vi.spyOn(internalCertificate, "getCertificateInfoFromFile").mockResolvedValue({ dates: { to: 1800000000 } });
		mocks.audit.mockRejectedValueOnce(new Error("audit unavailable"));
		await expect(internalCertificate.create(access(), row)).rejects.toThrow("audit unavailable");
		expect(query.deleteById).not.toHaveBeenCalled();
		expect(query.patchAndFetchById).toHaveBeenCalledOnce();
	});
	it("removes partial internal key files after failed issuance", async () => {
		const row = { id: 2, provider: "internal", domain_names: ["test.example"], meta: {} };
		const remove = vi.spyOn(fs.promises, "rm").mockResolvedValue();
		const query = { insertAndFetch: vi.fn().mockResolvedValue(row), deleteById: vi.fn().mockResolvedValue(1) };
		mocks.query.mockReturnValue(query);
		mocks.createLeadCert.mockRejectedValueOnce(new Error("OpenSSL failure"));
		await expect(internalCertificate.create(access(), row)).rejects.toThrow("OpenSSL failure");
		expect(remove).toHaveBeenCalledWith("/data/tls/internal/npm-2", { recursive: true, force: true });
		expect(query.deleteById).toHaveBeenCalledExactlyOnceWith(2);
	});
	it("leaves the old certificate pair intact when staging the private key fails", async () => {
		const { directory, realDirectory } = await mockCertificateDirectory();
		const writeFile = fs.promises.writeFile.getMockImplementation();
		fs.promises.writeFile.mockImplementation((filename, ...args) =>
			filename.endsWith("privkey.pem") ? Promise.reject(new Error("disk full")) : writeFile(filename, ...args),
		);
		const activate = vi.fn();
		await expect(
			internalCertificate.writeCustomCert(
				{
					id: 2,
					provider: "other",
					meta: {
						certificate: "new-certificate",
						certificate_key: "new-key",
					},
				},
				activate,
			),
		).rejects.toThrow("disk full");
		expect(await fs.promises.readFile(path.join(realDirectory, "fullchain.pem"), "utf8")).toBe("old-certificate");
		expect(await fs.promises.readFile(path.join(realDirectory, "privkey.pem"), "utf8")).toBe("old-key");
		expect(await fs.promises.readdir(directory)).toEqual(["npm-2"]);
		expect(activate).not.toHaveBeenCalled();
	});
	it("restores both files when activation or database persistence fails", async () => {
		const { directory, realDirectory } = await mockCertificateDirectory();
		await expect(
			internalCertificate.writeCustomCert(
				{
					id: 2,
					provider: "other",
					meta: {
						certificate: "new-certificate",
						certificate_key: "new-key",
					},
				},
				async () => {
					expect(await fs.promises.readFile(path.join(realDirectory, "fullchain.pem"), "utf8")).toBe(
						"new-certificate",
					);
					expect(await fs.promises.readFile(path.join(realDirectory, "privkey.pem"), "utf8")).toBe("new-key");
					throw new Error("activation failed");
				},
			),
		).rejects.toThrow("activation failed");
		expect(await fs.promises.readFile(path.join(realDirectory, "fullchain.pem"), "utf8")).toBe("old-certificate");
		expect(await fs.promises.readFile(path.join(realDirectory, "privkey.pem"), "utf8")).toBe("old-key");
		expect(await fs.promises.readdir(directory)).toEqual(["npm-2"]);
		expect(mocks.reload).toHaveBeenCalledOnce();
	});
	it("creates unique concurrent downloads and removes failed bundles", async () => {
		vi.spyOn(internalCertificate, "get").mockResolvedValue({ provider: "other", id: 2 });
		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		vi.spyOn(fs.promises, "readdir").mockResolvedValue(["privkey.pem"]);
		vi.spyOn(fs.promises, "realpath").mockImplementation(async (filename) => filename);
		vi.spyOn(internalCertificate, "zipFiles").mockResolvedValue();
		vi.spyOn(fs.promises, "rm").mockResolvedValue();
		vi.spyOn(Date, "now").mockReturnValue(1);
		const downloads = await Promise.all([
			internalCertificate.download(access(), { id: 2 }),
			internalCertificate.download(access(), { id: 2 }),
		]);
		expect(downloads[0].fileName).not.toBe(downloads[1].fileName);
		internalCertificate.zipFiles.mockRejectedValueOnce(new Error("archive failed"));
		await expect(internalCertificate.download(access(), { id: 2 })).rejects.toThrow("archive failed");
		expect(fs.promises.rm).toHaveBeenCalledWith(internalCertificate.zipFiles.mock.calls.at(-1)[1], { force: true });
	});
	it("rejects a certificate ZIP when a source file disappears during archiving", async () => {
		const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "shieldpm-zip-test-"));
		temporaryDirs.push(directory);
		await expect(
			internalCertificate.zipFiles(
				[path.join(directory, "missing.pem")],
				path.join(directory, "certificate.zip"),
			),
		).rejects.toMatchObject({ code: "ENOENT" });
	});
	it("rejects duplicate uploaded files as a validation error", () => {
		expect(() => internalCertificate.validate({ files: { certificate: [{ data: Buffer.from("PEM") }] } })).toThrow(
			"Exactly one certificate",
		);
	});
	it("publishes upload metadata after reload and excludes concurrent certificate deletion", async () => {
		const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
		const key = privateKey.export({ type: "pkcs8", format: "pem" });
		// Isolate activation ordering from the already independently tested cryptographic parser.
		vi.spyOn(X509Certificate.prototype, "checkPrivateKey").mockReturnValue(true);
		vi.spyOn(internalCertificate, "get").mockResolvedValue({ id: 2, provider: "other", meta: {} });
		vi.spyOn(internalCertificate, "validate").mockResolvedValue({
			certificate: { dates: { to: 1800000000 }, sans: ["test.example"] },
		});
		vi.spyOn(internalCertificate, "writeCustomCert").mockImplementation(async (_row, activate) => activate());
		const patch = vi.fn().mockResolvedValue({ id: 2 });
		mocks.query.mockReturnValue({ patchAndFetchById: patch });
		const started = Promise.withResolvers();
		const hold = Promise.withResolvers();
		mocks.reload.mockImplementationOnce(() => {
			started.resolve();
			return hold.promise;
		});
		const pending = internalCertificate.upload(access(), {
			id: 2,
			files: {
				certificate: { data: Buffer.from(rootCertificates[0]) },
				certificate_key: { data: Buffer.from(key) },
			},
		});
		await started.promise;
		expect(patch).not.toHaveBeenCalled();
		await expect(internalCertificate.delete(access(), { id: 2 })).rejects.toThrow("Another operation");
		hold.resolve();
		await expect(pending).resolves.toEqual({ certificate: true, certificate_key: true });
		expect(patch).toHaveBeenCalledWith(2, expect.objectContaining({ domain_names: ["test.example"] }));
		await expect(internalCertificate.renew(access(), { id: 2 })).rejects.toThrow("Only Certbot");
	});
	it("does not persist upload metadata when nginx rejects the replacement", async () => {
		const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
		vi.spyOn(X509Certificate.prototype, "checkPrivateKey").mockReturnValue(true);
		vi.spyOn(internalCertificate, "get").mockResolvedValue({
			id: 2,
			provider: "other",
			meta: {
				certificate_key: privateKey.export({ type: "pkcs8", format: "pem" }),
			},
		});
		vi.spyOn(internalCertificate, "validate").mockResolvedValue({ certificate: { dates: { to: 1800000000 } } });
		vi.spyOn(internalCertificate, "writeCustomCert").mockImplementation(async (_row, activate) => activate());
		mocks.reload.mockRejectedValueOnce(new Error("nginx reload failed"));
		await expect(
			internalCertificate.upload(access(), {
				id: 2,
				files: {
					certificate: { data: Buffer.from(rootCertificates[0]) },
				},
			}),
		).rejects.toThrow("nginx reload failed");
		expect(mocks.query).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
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
		expect(mocks.configurationLock).toHaveBeenCalledOnce();
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
	const mockCleanup = (hosts = []) => {
		const certificates = queryFor([]);
		certificates.select = vi.fn().mockReturnValue(certificates);
		certificates.patch = vi.fn().mockResolvedValue(1);
		mocks.query.mockReturnValue(certificates);
		const proxyQuery = Object.assign(queryFor(hosts), {
			patch: vi.fn().mockResolvedValue(1),
			findById: vi.fn((id) =>
				Object.assign(Promise.resolve({ ...hosts.find((host) => host.id === id), certificate_id: 0 }), {
					withGraphFetched: vi.fn().mockReturnThis(),
				}),
			),
		});
		mocks.proxyQuery.mockReturnValue(proxyQuery);
		for (const query of [mocks.deadQuery, mocks.redirectQuery, mocks.streamQuery])
			query.mockReturnValue(queryFor([]));
		return { certificates, proxyQuery };
	};

	it("defers orphan cleanup until another configuration operation releases the lock", async () => {
		mockCleanup();
		const hold = Promise.withResolvers();
		mocks.configurationLock.mockImplementationOnce(async (operation) => {
			await hold.promise;
			return operation();
		});
		const cleanup = internalCertificate.cleanUpMissingCertificates();
		expect(mocks.query).not.toHaveBeenCalled();
		hold.resolve();
		await cleanup;
		expect(mocks.query).toHaveBeenCalledOnce();
	});

	it("holds one configuration lock through detachment and file deletion, before auditing", async () => {
		const { certificates } = mockCleanup([{ id: 8, certificate_id: 2, enabled: true, meta: {} }]);
		vi.spyOn(internalCertificate, "get").mockResolvedValue({ id: 2, provider: "other", meta: {} });
		let lockHeld = false;
		mocks.configurationLock.mockImplementationOnce(async (operation) => {
			lockHeld = true;
			try {
				return await operation();
			} finally {
				lockHeld = false;
			}
		});
		const remove = vi.spyOn(fs.promises, "rm").mockImplementation(async () => {
			expect(lockHeld).toBe(true);
			expect(mocks.reload).toHaveBeenCalledOnce();
		});
		mocks.audit.mockImplementationOnce(async () => {
			expect(lockHeld).toBe(false);
			expect(remove).toHaveBeenCalledTimes(2);
		});
		await expect(internalCertificate.delete(access(), { id: 2 })).resolves.toBe(true);
		expect(mocks.configurationLock).toHaveBeenCalledOnce();
		expect(certificates.patch).toHaveBeenCalledExactlyOnceWith({ is_deleted: 1 });
	});

	it("restores references and configurations while retaining certificate files after failed detachment", async () => {
		const host = { id: 8, certificate_id: 2, enabled: true, ssl_forced: 1, meta: { nginx_online: true } };
		const { certificates, proxyQuery } = mockCleanup([host]);
		vi.spyOn(internalCertificate, "get").mockResolvedValue({ id: 2, provider: "other", meta: {} });
		const remove = vi.spyOn(fs.promises, "rm").mockResolvedValue();
		mocks.reload.mockRejectedValueOnce(new Error("Reload rejected"));
		await expect(internalCertificate.delete(access(), { id: 2 })).rejects.toThrow("Reload rejected");
		expect(certificates.patch).toHaveBeenLastCalledWith({ is_deleted: 0 });
		expect(proxyQuery.patch).toHaveBeenLastCalledWith({ certificate_id: 2, ssl_forced: 1, meta: host.meta });
		expect(mocks.restoreConfig).toHaveBeenCalledWith("proxy_host", host);
		expect(mocks.reload).toHaveBeenCalledTimes(2);
		expect(remove).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});

	it("finishes certificate removal even when subsequent audit persistence fails", async () => {
		const { certificates } = mockCleanup();
		vi.spyOn(internalCertificate, "get").mockResolvedValue({ id: 2, provider: "other", meta: {} });
		const remove = vi.spyOn(fs.promises, "rm").mockResolvedValue();
		mocks.audit.mockRejectedValueOnce(new Error("Audit unavailable"));
		await expect(internalCertificate.delete(access(), { id: 2 })).rejects.toThrow("Audit unavailable");
		expect(remove).toHaveBeenCalledTimes(2);
		expect(certificates.patch).toHaveBeenCalledExactlyOnceWith({ is_deleted: 1 });
	});
	it("leaves certificate and host references untouched when Certbot is already renewing", async () => {
		const { certificates, proxyQuery } = mockCleanup([{ id: 8, certificate_id: 2, enabled: true, meta: {} }]);
		vi.spyOn(internalCertificate, "get").mockResolvedValue({ id: 2, provider: "letsencrypt", meta: {} });
		vi.spyOn(internalCertificate, "revokeCertbot").mockRejectedValue(new Error("Another Certbot process"));
		await expect(internalCertificate.delete(access(), { id: 2 })).rejects.toThrow("Another Certbot process");
		expect(certificates.patch).not.toHaveBeenCalled();
		expect(proxyQuery.patch).not.toHaveBeenCalled();
		expect(mocks.reload).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});
	it("detaches Let's Encrypt hosts only after the revocation operation has acquired Certbot", async () => {
		const { certificates } = mockCleanup([{ id: 8, certificate_id: 2, enabled: true, meta: {} }]);
		const row = { id: 2, provider: "letsencrypt", meta: {} };
		vi.spyOn(internalCertificate, "get").mockResolvedValue(row);
		vi.spyOn(internalCertificate, "revokeCertbot").mockImplementation(async (_row, _throwErrors, prepare) => {
			expect(certificates.patch).not.toHaveBeenCalled();
			await prepare();
			expect(certificates.patch).toHaveBeenCalledExactlyOnceWith({ is_deleted: 1 });
			expect(mocks.reload).toHaveBeenCalledOnce();
		});
		await expect(internalCertificate.delete(access(), { id: 2 })).resolves.toBe(true);
		expect(internalCertificate.revokeCertbot).toHaveBeenCalledWith(row, true, expect.any(Function));
	});
	it("queues periodic renewal reloads behind active configuration writes", async () => {
		const entered = Promise.withResolvers();
		const hold = Promise.withResolvers();
		mocks.runCertbot.mockResolvedValue("");
		mocks.query.mockReturnValue(queryFor([]));
		mocks.configurationLock.mockImplementationOnce(async (operation) => {
			entered.resolve();
			await hold.promise;
			return operation();
		});
		const renewal = internalCertificate.processExpiringHosts();
		await entered.promise;
		expect(mocks.reload).not.toHaveBeenCalled();
		hold.resolve();
		await renewal;
		expect(mocks.reload).toHaveBeenCalledOnce();
		expect(internalCertificate.intervalProcessing).toBe(false);
	});
});
