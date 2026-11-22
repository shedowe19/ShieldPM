import { describe, expect, it } from "vitest";
import utils, { validatePublicHttpsUrl } from "../../lib/utils.js";

describe("public HTTPS target validation", () => {
	it.each(["https://auth.example.test", "https://auth.example.test:8443", "https://93.184.216.34"])(
		"accepts a public https origin: %s",
		(value) => {
			expect(validatePublicHttpsUrl(value)).toMatch(/^https:\/\//);
		},
	);

	it("accepts and preserves a path only where the caller allows one", () => {
		expect(validatePublicHttpsUrl("https://login.example.test/realms/test", { allowPath: true })).toBe(
			"https://login.example.test/realms/test",
		);
		expect(() => validatePublicHttpsUrl("https://login.example.test/realms/test")).toThrow("bare origin");
	});

	it.each([
		"http://auth.example.test",
		"https://localhost",
		"https://127.0.0.1",
		"https://[::1]",
		"https://10.0.0.5",
		"https://172.16.0.1",
		"https://192.168.1.1",
		"https://169.254.169.254",
		"https://auth.local",
		"https://auth.internal",
		"https://metadata.google.internal",
		"https://user:pass@auth.example.test",
		"https://auth.example.test?next=1",
		"https://auth.example.test#fragment",
		"unix:/run/shieldpm/oauth2-proxy.sock",
		"https://auth.example.test;include /tmp/x;",
	])("rejects an SSRF-capable or malformed target: %s", (value) => {
		expect(() => validatePublicHttpsUrl(value, { allowPath: true })).toThrow();
	});
});

describe("bounded command execution", () => {
	it("terminates a hung helper instead of blocking the configuration lock", async () => {
		await expect(
			utils.execFile(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { timeout: 50 }),
		).rejects.toThrow(/terminated after timeout/);
	});
});
