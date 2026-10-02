import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock("../../lib/utils.js", () => ({ default: { execFile: mocks.exec } }));

import {
	createAcmeConfig,
	ensureAcmeAccount,
	findAcmeAccounts,
	getAccountDirectory,
	getCertificateIssuer,
	redactAcmeOutput,
} from "../../internal/acme-runtime.js";

const privateJwk = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "jwk" });
const policy = {
	server: "https://ca.example.test/v2/directory",
	email: "admin@example.test",
	account_id: "",
	eab_kid: "",
	eab_hmac_key: "",
	agree_tos: true,
	must_staple: false,
	server_tls_verify: true,
};

describe("ACME issuer, account and private operation configuration", () => {
	let root;
	beforeEach(async () => {
		vi.resetAllMocks();
		root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "shieldpm-acme-runtime-"));
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await fs.promises.rm(root, { force: true, recursive: true });
	});
	const account = async (server, id, contacts = ["mailto:admin@example.test"]) => {
		const directory = path.join(getAccountDirectory(server, root), id);
		await fs.promises.mkdir(directory, { recursive: true });
		await fs.promises.writeFile(
			path.join(directory, "regr.json"),
			JSON.stringify({ uri: `${server}/account/${id}`, body: { status: "valid", contact: contacts } }),
		);
		await fs.promises.writeFile(path.join(directory, "private_key.json"), JSON.stringify(privateJwk));
		await fs.promises.writeFile(
			path.join(directory, "meta.json"),
			JSON.stringify({ creation_dt: "2026-09-30T00:00:00Z", creation_host: "test" }),
		);
		return directory;
	};
	it.each([
		["https://ca.example.test:8443/v2/directory", "ca.example.test:8443/v2/directory"],
		["https://CA.EXAMPLE.TEST:443/directory", "CA.EXAMPLE.TEST:443/directory"],
		["https://[2001:db8::1]:8443/v2/directory", "[2001:db8::1]:8443/v2/directory"],
		["https://[2001:db8::1]:443/directory", "[2001:db8::1]:443/directory"],
		["https://ca.example.test/v2;segment/directory;params?query=1", "ca.example.test/v2;segment/directory"],
		["https://CA.EXAMPLE.TEST", "CA.EXAMPLE.TEST"],
	])("matches Python Certbot account paths for %s", (server, expected) => {
		expect(getAccountDirectory(server, root)).toBe(path.join(root, "accounts", expected));
	});
	it.each([
		"https://ca.example.test/../../../escape",
		"https://user:pass@ca.example.test/directory",
		"https://ca.example.test/directory#fragment",
	])("rejects unsafe account paths %s", (server) => {
		expect(() => getAccountDirectory(server, root)).toThrow();
	});
	it("isolates private configuration and Certbot logs, overriding previous true booleans", async () => {
		const config = await createAcmeConfig({ ...policy, agree_tos: false }, policy.server, { workRoot: root });
		const contents = await fs.promises.readFile(config.filename, "utf8");
		expect((await fs.promises.stat(path.dirname(config.filename))).mode & 0o777).toBe(0o700);
		expect((await fs.promises.stat(config.filename)).mode & 0o777).toBe(0o600);
		expect(contents).toContain(`logs-dir = ${path.dirname(config.filename)}/logs`);
		expect(contents).toContain("must-staple = false\n");
		expect(contents).toContain("no-verify-ssl = false\n");
		expect(contents).toContain("agree-tos = false\n");
		await config.cleanup();
		expect(fs.existsSync(path.dirname(config.filename))).toBe(false);
	});
	it("keeps EAB secrets out of argv and sanitizes stdout, stderr and command errors", async () => {
		const key = "synthetic_hmac-secret==";
		const config = await createAcmeConfig({ ...policy, eab_hmac_key: key }, policy.server, { workRoot: root });
		await config.writeEab("synthetic-kid", key);
		mocks.exec.mockResolvedValueOnce(`response ${key} ${encodeURIComponent(key)} synthetic-kid`);
		expect(await config.exec(["register", "--server", policy.server])).toBe(
			"response [REDACTED] [REDACTED] [REDACTED]",
		);
		expect(JSON.stringify(mocks.exec.mock.calls)).not.toContain(key);
		mocks.exec.mockRejectedValueOnce(new Error(`bad response ${key}`));
		try {
			await config.exec(["register"]);
			throw new Error("expected failure");
		} catch (error) {
			expect(error.message).toBe("bad response [REDACTED]");
			expect(error.stack).not.toContain(key);
			expect(error.previous).toBeUndefined();
		}
		await config.cleanup();
	});
	it.each(["[list]", "kid\nno-verify-ssl=true", "kid #comment", '"quoted"', "kid;comment"])(
		"rejects INI reinterpretation in EAB identifiers %s",
		async (kid) => {
			const config = await createAcmeConfig(policy, policy.server, { workRoot: root });
			await expect(config.writeEab(kid, "synthetic_key")).rejects.toThrow("Invalid ACME account binding");
			expect(mocks.exec).not.toHaveBeenCalled();
			await config.cleanup();
		},
	);
	it("requires valid registration, private key and account metadata rather than accepting marker files", async () => {
		const good = await account(policy.server, "good-account");
		const corrupt = await account(policy.server, "corrupt-account");
		await fs.promises.writeFile(path.join(corrupt, "private_key.json"), "{}");
		const metadata = await account(policy.server, "bad-meta");
		await fs.promises.writeFile(path.join(metadata, "meta.json"), "{}");
		expect(await findAcmeAccounts(policy.server, root)).toEqual(["good-account"]);
		expect(good).toContain("/v2/directory/good-account");
		expect(await findAcmeAccounts("https://ca.example.test/other/directory", root)).toEqual([]);
	});
	it("keeps an original account despite a newly selected global account and updates email through Certbot", async () => {
		await account(policy.server, "old-account", ["mailto:previous@example.test"]);
		await account(policy.server, "new-account");
		const config = { exec: vi.fn().mockResolvedValue("updated") };
		expect(
			await ensureAcmeAccount(
				config,
				{ ...policy, agree_tos: false, account_id: "new-account" },
				{ server: policy.server, account: "old-account" },
				{ root, allowRegistration: false },
			),
		).toBe("old-account");
		expect(config.exec).toHaveBeenCalledExactlyOnceWith([
			"update_account",
			"--server",
			policy.server,
			"--account",
			"old-account",
			"--email",
			policy.email,
		]);
	});
	it("supports an explicitly selected existing account and rejects ambiguous auto-selection", async () => {
		await account(policy.server, "one");
		await account(policy.server, "two");
		const config = { exec: vi.fn() };
		await expect(
			ensureAcmeAccount(config, policy, { server: policy.server, account: null }, { root }),
		).rejects.toThrow("Multiple accounts");
		expect(
			await ensureAcmeAccount(
				config,
				{ ...policy, account_id: "two" },
				{ server: policy.server, account: null },
				{ root },
			),
		).toBe("two");
		expect(config.exec).not.toHaveBeenCalled();
	});
	it("requires terms acceptance before registration, without changing existing accounts", async () => {
		const config = { exec: vi.fn() };
		await expect(
			ensureAcmeAccount(
				config,
				{ ...policy, agree_tos: false },
				{ server: policy.server, account: null },
				{ root },
			),
		).rejects.toThrow("Accept the ACME server's terms");
		await account(policy.server, "existing");
		expect(
			await ensureAcmeAccount(
				config,
				{ ...policy, agree_tos: false },
				{ server: policy.server, account: null },
				{ root },
			),
		).toBe("existing");
		expect(config.exec).not.toHaveBeenCalled();
	});
	it("never registers a replacement for a missing original account", async () => {
		const config = { exec: vi.fn() };
		await expect(
			ensureAcmeAccount(
				config,
				policy,
				{ server: policy.server, account: "missing" },
				{ root, allowRegistration: false },
			),
		).rejects.toThrow("original ACME account is missing");
		expect(config.exec).not.toHaveBeenCalled();
	});
	it("registers using private EAB config then reads the actual account from its directory", async () => {
		const config = { exec: vi.fn(async () => account(policy.server, "registered")), writeEab: vi.fn() };
		expect(
			await ensureAcmeAccount(
				config,
				{ ...policy, eab_kid: "kid", eab_hmac_key: "synthetic_key" },
				{ server: policy.server, account: null },
				{ root },
			),
		).toBe("registered");
		expect(config.writeEab).toHaveBeenCalledExactlyOnceWith("kid", "synthetic_key");
		expect(config.exec.mock.calls[0][0]).toEqual(["register", "--server", policy.server, "--email", policy.email]);
	});
	it("preserves lazy ZeroSSL account binding and rejects malformed responses without exposing credentials", async () => {
		const server = "https://acme.zerossl.com/v2/DV90";
		const config = { exec: vi.fn(async () => account(server, "registered")), writeEab: vi.fn() };
		mocks.exec.mockResolvedValue(JSON.stringify({ eab_kid: "zero-kid", eab_hmac_key: "synthetic_zero_key" }));
		expect(await ensureAcmeAccount(config, policy, { server, account: null }, { root })).toBe("registered");
		expect(config.writeEab).toHaveBeenCalledExactlyOnceWith("zero-kid", "synthetic_zero_key");
		expect(mocks.exec.mock.calls[0][0]).toBe("curl");
		await fs.promises.rm(getAccountDirectory(server, root), { recursive: true, force: true });
		mocks.exec.mockResolvedValue(JSON.stringify({ eab_kid: "[unsafe]", eab_hmac_key: "synthetic_zero_key" }));
		await expect(ensureAcmeAccount(config, policy, { server, account: null }, { root })).rejects.toThrow(
			"Could not obtain ZeroSSL",
		);
	});
	it("reads original lineage bindings, rejects snapshot mismatches and does not fall back when absent", async () => {
		await fs.promises.mkdir(path.join(root, "renewal"));
		await fs.promises.writeFile(
			path.join(root, "renewal", "npm-7.conf"),
			`server = ignored-outside-section\n[renewalparams]\nserver = ${policy.server}\naccount = original-account\n[[webroot_map]]\nserver = ignored-nested\n`,
		);
		expect(await getCertificateIssuer({ id: 7, meta: {} }, root)).toEqual({
			server: policy.server,
			account: "original-account",
		});
		await expect(
			getCertificateIssuer(
				{ id: 7, meta: { acme_server: "https://new.example.test/directory", acme_account: "new-account" } },
				root,
			),
		).rejects.toThrow("does not match");
		await expect(
			getCertificateIssuer(
				{ id: 8, meta: { acme_server: policy.server, acme_account: "original-account" } },
				root,
			),
		).rejects.toThrow("could not be read");
	});
	it("redacts escaped secret representations without replacing empty strings", () => {
		expect(redactAcmeOutput("token=a%2Fb raw=a/b", ["", "a/b"])).toBe("token=[REDACTED] raw=[REDACTED]");
	});
});
