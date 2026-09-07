import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ exec: vi.fn(), exists: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock("../../lib/utils.js", () => ({ default: { execFile: mocks.exec } }));
vi.mock("node:fs", () => ({
	default: {
		existsSync: mocks.exists,
		mkdirSync: vi.fn(),
		writeFileSync: mocks.write,
		unlinkSync: vi.fn(),
		promises: { mkdir: vi.fn(), readFile: mocks.read, writeFile: mocks.write },
	},
}));

import pki from "../../internal/pki.js";

describe("internal PKI", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.exists.mockReturnValue(true);
		mocks.read.mockResolvedValue("certificate");
		mocks.exec.mockResolvedValue("");
	});
	afterEach(() => vi.restoreAllMocks());
	it.each([undefined, [], ["example.test\n[evil]"], [null]])(
		"rejects invalid domain list before filesystem or OpenSSL side effects: %j",
		async (domains) => {
			await expect(pki.createLeadCert({ domain_names: domains }, "/tmp/pki-test")).rejects.toThrow();
			expect(mocks.exec).not.toHaveBeenCalled();
			expect(mocks.write).not.toHaveBeenCalled();
		},
	);
	it("accepts an internal wildcard certificate and uses independent random serials", async () => {
		await pki.createLeadCert({ domain_names: ["*.example.test"] }, "/tmp/pki-test");
		await pki.createLeadCert({ domain_names: ["*.example.test"] }, "/tmp/pki-test");
		const commands = mocks.exec.mock.calls.filter(([, args]) => args[0] === "x509");
		const serials = commands.map(([, args]) => args[args.indexOf("-set_serial") + 1]);
		expect(serials[0]).toMatch(/^0x[0-9a-f]{38}$/);
		expect(serials[0]).not.toBe(serials[1]);
		expect(mocks.write).toHaveBeenCalledWith(
			expect.stringContaining("openssl.cnf"),
			expect.stringContaining("subjectAltName = DNS:*.example.test"),
		);
	});
	it("passes PKCS#12 passwords through the child environment, never the command line", async () => {
		await pki.createClientCert(
			{ common_name: "test@example.test", password: "synthetic-test-password" },
			"/tmp/pki-test",
		);
		const call = mocks.exec.mock.calls.find(([, args]) => args[0] === "pkcs12");
		expect(call[1]).toContain("env:SHIELDPM_P12_PASSWORD");
		expect(call[1].join(" ")).not.toContain("synthetic-test-password");
		expect(call[2].env.SHIELDPM_P12_PASSWORD).toBe("synthetic-test-password");
	});
	it.each([0, -1, 11, "invalid", Number.POSITIVE_INFINITY])(
		"rejects invalid validity before key generation: %s",
		async (years) => {
			await expect(
				pki.createLeadCert({ domain_names: ["example.test"], years }, "/tmp/pki-test"),
			).rejects.toThrow("validity");
			expect(mocks.exec).not.toHaveBeenCalled();
		},
	);
	it("serializes concurrent CA creation instead of replacing its key during issuance", async () => {
		mocks.exists.mockReturnValue(false);
		let release;
		mocks.exec.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		const first = pki.ensureRootCa();
		const second = pki.ensureRootCa();
		expect(mocks.exec).toHaveBeenCalledTimes(1);
		release("");
		await Promise.all([first, second]);
		expect(mocks.exec.mock.calls.filter(([, args]) => args[0] === "genpkey")).toHaveLength(1);
	});
});
