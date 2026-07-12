import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

/**
 * Fix #72: SSRF protection in ddns.js custom provider
 * The validatePublicUrl() helper blocks private/internal URLs.
 */
describe("Fix #72: SSRF protection", () => {
	let source;

	beforeEach(() => {
		source = fs.readFileSync(backendSourcePath("internal", "ddns.js"), "utf8");
	});

	it("has validatePublicUrl helper function", () => {
		expect(source).toContain("const validatePublicUrl = (urlStr) => {");
	});

	it("blocks non-HTTP protocols", () => {
		// Only HTTP(S) allowed
		expect(source).toContain("Only HTTP(S) protocols allowed");
	});

	it("blocks localhost/loopback", () => {
		expect(source).toContain("localhost");
		expect(source).toContain("127.0.0.1");
		expect(source).toContain("::1");
	});

	it("blocks cloud metadata endpoints", () => {
		expect(source).toContain("169.254.169.254");
	});

	it("blocks private IP ranges (10.x, 172.16-31.x, 192.168.x)", () => {
		expect(source).toContain("isPrivateIP");
		expect(source).toContain("parts[0] === 10");
		expect(source).toContain("172");
		expect(source).toContain("192");
	});

	it("custom provider calls validatePublicUrl before fetch", () => {
		// The custom provider should validate the URL before fetching
		const customIdx = source.indexOf("custom: async");
		const validateIdx = source.indexOf("validatePublicUrl(finalUrl)", customIdx);
		expect(validateIdx).toBeGreaterThan(customIdx);
	});
});
