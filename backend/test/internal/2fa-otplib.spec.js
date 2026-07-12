import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

/**
 * Fix #69: Verify otplib v13 uses standalone exports correctly.
 * otplib v13 provides generateSecret, generateURI, verifySync as top-level
 * named exports (NOT via an `authenticator` namespace object).
 */
describe("Fix #69: otplib v13 uses standalone exports", () => {
	let source;

	beforeEach(() => {
		source = fs.readFileSync(backendSourcePath("internal", "2fa-service.js"), "utf8");
	});

	it("imports otplib standalone functions (generateSecret, generateURI, verifySync)", () => {
		expect(source).toContain('import { generateSecret, generateURI, verifySync } from "otplib"');
	});

	it("uses generateSecret() for secret generation", () => {
		expect(source).toContain("generateSecret()");
	});

	it("uses generateURI() for URI generation", () => {
		expect(source).toContain("generateURI({");
	});

	it("uses verifySync().valid for TOTP verification", () => {
		// Both verifyAndEnableTotp and verifyTotp use verifySync({ token, secret }).valid
		expect(source).toContain("verifySync({ token: code, secret: record.secret }).valid");
	});

	it("does not use non-existent authenticator namespace", () => {
		// The incorrect import that was tried:
		expect(source).not.toContain('import { authenticator } from "otplib"');
	});
});
