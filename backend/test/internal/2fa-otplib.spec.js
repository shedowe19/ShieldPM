import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";

/**
 * Fix #69: otplib v12+ API changed. verifySync is not a standalone export.
 * Must use authenticator.verify() instead. Also generateSecret/generateURI
 * are now authenticator.generateSecret()/authenticator.generateUri().
 */

describe("Fix #69: otplib API uses authenticator namespace", () => {
	let source;

	beforeEach(() => {
		source = fs.readFileSync(
			"/Projekte/ShieldPM/backend/internal/2fa-service.js",
			"utf8",
		);
	});

	it("imports authenticator from otplib (not standalone functions)", () => {
		// The old import was: import { generateSecret, generateURI, verifySync } from "otplib";
		// The fix imports: import { authenticator } from "otplib";
		expect(source).toContain('import { authenticator } from "otplib"');
		// verifySync must not appear anywhere (no such standalone export)
		expect(source).not.toContain('verifySync');
		// generateSecret must only appear as authenticator.generateSecret()
		// not as a standalone import
		expect(source).not.toMatch(/^\s*import.+\bgenerateSecret/m);
		// generateURI must only appear as authenticator.generateUri()
		// not as a standalone import
		expect(source).not.toMatch(/^\s*import.+\bgenerateURI\b/m);
	});

	it("uses authenticator.verify() for TOTP verification", () => {
		// verifyAndEnableTotp must use authenticator.verify({ token, secret })
		expect(source).toContain('authenticator.verify({ token: code, secret: record.secret })');
	});

	it("uses authenticator.generateSecret() for secret generation", () => {
		// setupTotp must use authenticator.generateSecret()
		expect(source).toContain("authenticator.generateSecret()");
	});

	it("uses authenticator.generateUri() for URI generation", () => {
		// setupTotp must use authenticator.generateUri()
		expect(source).toContain("authenticator.generateUri(");
	});

	it("no references to non-existent standalone verifySync function", () => {
		// verifySync must not appear anywhere
		expect(source).not.toContain("verifySync");
	});
});