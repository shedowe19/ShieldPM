import { afterEach, describe, expect, it, vi } from "vitest";
import { isSecretFieldName, global as logger, redact, redactText } from "../../logger.js";

describe("central log redaction", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("masks the credential fields an access or request logger may receive", () => {
		const result = redact({
			password: "plain-password",
			token: "plain-token",
			authorization: "Bearer plain-bearer-token",
			cookie: "shieldpm_jwt=plain-cookie",
			client_secret: "plain-client-secret",
			clientSecret: "plain-client-secret-camel",
			api_key: "plain-api-key",
			apiKey: "plain-api-key-camel",
			git_credentials: "plain-git-credentials",
			terminal_password: "plain-terminal-password",
			terminal_private_key: "-----BEGIN PRIVATE KEY-----\nplain-key\n-----END PRIVATE KEY-----",
			nested: { password: "nested-password", note: "keep-me" },
			has_token: true,
			api_key_configured: true,
		});

		expect(result).toMatchObject({
			password: "[REDACTED]",
			token: "[REDACTED]",
			authorization: "[REDACTED]",
			cookie: "[REDACTED]",
			client_secret: "[REDACTED]",
			clientSecret: "[REDACTED]",
			api_key: "[REDACTED]",
			apiKey: "[REDACTED]",
			git_credentials: "[REDACTED]",
			terminal_password: "[REDACTED]",
			terminal_private_key: "[REDACTED]",
			nested: { password: "[REDACTED]", note: "keep-me" },
			has_token: true,
			api_key_configured: true,
		});
		expect(JSON.stringify(result)).not.toMatch(/plain-/);
	});

	it("does not mutate the logged payload", () => {
		const payload = { password: "plain-password" };
		redact(payload);
		expect(payload.password).toBe("plain-password");
	});

	it("redacts key material, bearer credentials and provider tokens inside strings", () => {
		const hexKey = "a".repeat(64);
		const privateKey = "-----BEGIN RSA PRIVATE KEY-----\nMIIEprivate\n-----END RSA PRIVATE KEY-----";
		const text = [
			`{"encryptionKey":"${hexKey}"}`,
			privateKey,
			"Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
			`sk-${"b".repeat(24)}`,
			`AIza${"c".repeat(35)}`,
			`ghp_${"d".repeat(24)}`,
		].join(" ");

		const redacted = redactText(text);

		expect(redacted).not.toContain(hexKey);
		expect(redacted).not.toContain("MIIEprivate");
		expect(redacted).not.toContain("eyJhbGciOiJSUzI1NiJ9");
		expect(redacted).not.toContain(`sk-${"b".repeat(24)}`);
		expect(redacted).not.toContain(`AIza${"c".repeat(35)}`);
		expect(redacted).not.toContain(`ghp_${"d".repeat(24)}`);
	});

	it("redacts credentials in error messages without changing the error name", () => {
		const result = redact(new Error("request failed: Authorization: Bearer abcdefghijkl"));
		expect(result.name).toBe("Error");
		expect(result.message).toContain("[REDACTED]");
		expect(result.message).not.toContain("abcdefghijkl");
	});

	it("recognises snake_case and camelCase names but not status flags", () => {
		for (const name of [
			"password",
			"authorization",
			"cookie",
			"client_secret",
			"clientSecret",
			"api_key",
			"apiKey",
			"x-auth-token",
			"private_key",
			"encryptionKey",
			"git_credentials",
		]) {
			expect(isSecretFieldName(name), name).toBe(true);
		}
		for (const name of [
			"has_token",
			"api_key_configured",
			"name",
			"enabled",
			"cache_key",
			"authorization_revision",
		]) {
			expect(isSecretFieldName(name), name).toBe(false);
		}
	});

	it("never writes a credential through a logger method", () => {
		const written = [];
		const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
			written.push(String(chunk));
			return true;
		});
		try {
			logger.info("request payload", {
				password: "plain-password",
				token: "plain-token",
				authorization: "Bearer plain-bearer-token",
				cookie: "shieldpm_jwt=plain-cookie",
				client_secret: "plain-client-secret",
				api_key: "plain-api-key",
				keys: `{"encryptionKey":"${"e".repeat(64)}"}`,
			});
		} finally {
			write.mockRestore();
		}
		const output = written.join("");
		expect(output).toContain("[REDACTED]");
		expect(output).not.toMatch(/plain-password|plain-token|plain-bearer-token|plain-cookie/);
		expect(output).not.toContain("plain-client-secret");
		expect(output).not.toContain("plain-api-key");
		expect(output).not.toContain("e".repeat(64));
	});
});
