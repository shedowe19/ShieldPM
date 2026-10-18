import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/utils.js", () => ({ default: { execFile: vi.fn().mockResolvedValue("issued") } }));

import { acmeRegistrationArguments, isProcessing, runCertbot } from "../../internal/certbot.js";
import utils from "../../lib/utils.js";

describe("lazy ACME account registration", () => {
	let directory;
	beforeEach(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-acme-"));
		vi.stubEnv("DATA_PATH", directory);
		vi.stubEnv("ACME_SERVER", "https://acme-v02.api.letsencrypt.org/directory");
		vi.stubEnv("ACME_EMAIL", "");
		vi.stubEnv("ACME_EAB_KID", "");
		vi.stubEnv("ACME_EAB_HMAC_KEY", "");
		vi.clearAllMocks();
	});
	afterEach(async () => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		await fs.rm(directory, { recursive: true, force: true });
	});
	it("registers without email only when issuing, while renewals retain their arguments", async () => {
		await runCertbot(["certonly", "--domains", "example.test"]);
		expect(utils.execFile).toHaveBeenCalledWith("certbot", [
			"certonly",
			"--domains",
			"example.test",
			"--register-unsafely-without-email",
		]);
		await runCertbot(["renew"]);
		expect(utils.execFile).toHaveBeenLastCalledWith("certbot", ["renew"]);
	});
	it("keeps EAB credentials scoped to the issuing process and email", async () => {
		vi.stubEnv("ACME_EMAIL", "admin@example.test");
		vi.stubEnv("ACME_EAB_KID", "synthetic-id");
		vi.stubEnv("ACME_EAB_HMAC_KEY", "synthetic-key");
		expect(await acmeRegistrationArguments()).toEqual([
			"--email",
			"admin@example.test",
			"--eab-kid",
			"synthetic-id",
			"--eab-hmac-key",
			"synthetic-key",
		]);
	});
	it("a ZeroSSL failure releases the shared processing lock and stays local to the request", async () => {
		vi.stubEnv("ACME_SERVER", "https://acme.zerossl.com/v2/DV90");
		vi.stubEnv("ACME_EMAIL", "admin@example.test");
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("provider offline")));
		await expect(runCertbot(["certonly"])).rejects.toThrow("retry the certificate request later");
		expect(isProcessing()).toBe(false);
		expect(utils.execFile).not.toHaveBeenCalled();
		expect(fetch).toHaveBeenCalledWith(
			expect.stringContaining("zerossl.com"),
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
	});
	it("does not contact ZeroSSL when a saved account already exists", async () => {
		vi.stubEnv("ACME_SERVER", "https://acme.zerossl.com/v2/DV90");
		const accounts = path.join(directory, "tls/certbot/accounts/acme.zerossl.com/account");
		await fs.mkdir(accounts, { recursive: true });
		await fs.writeFile(path.join(accounts, "regr.json"), "{}");
		vi.stubGlobal("fetch", vi.fn());
		expect(await acmeRegistrationArguments()).toEqual(["--register-unsafely-without-email"]);
		expect(fetch).not.toHaveBeenCalled();
	});
});
