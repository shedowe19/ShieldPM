import { describe, expect, it } from "vitest";
import { redactRepositoryUrl, sanitizeHostMeta, sanitizeProxyHost } from "../../lib/host-response.js";

describe("host response credential hygiene", () => {
	it("removes terminal, git and access-list credentials from a proxy host", () => {
		const host = {
			id: 1,
			domain_names: ["example.test"],
			terminal_password: "ssh-password",
			terminal_private_key: "-----BEGIN PRIVATE KEY-----\nssh-key\n-----END PRIVATE KEY-----",
			git_credentials: "git-token",
			git_repo_url: "https://user:git-token@git.example.test/repo.git?private_token=git-token",
			certificate: { id: 4, meta: { certificate_key: "certificate-private-key" } },
			access_list: {
				id: 7,
				meta: {
					oauth2_client_secret: "oauth2-secret",
					oauth2_cookie_secret: "cookie-secret",
					oidc_client_secret: "oidc-secret",
					note: "kept",
				},
				items: [{ username: "admin", password: "$2b$12$hash" }],
			},
			meta: {
				note: "kept",
				dns_provider_credentials: "dns-token",
				nested: { token: "nested-token", keep: true },
			},
		};

		const result = sanitizeProxyHost(host);

		const serialized = JSON.stringify(result);
		for (const secret of [
			"ssh-password",
			"ssh-key",
			"git-token",
			"certificate-private-key",
			"oauth2-secret",
			"cookie-secret",
			"oidc-secret",
			"$2b$12$hash",
			"dns-token",
			"nested-token",
		]) {
			expect(serialized, secret).not.toContain(secret);
		}
		expect(result).not.toHaveProperty("terminal_password");
		expect(result).not.toHaveProperty("terminal_private_key");
		expect(result).not.toHaveProperty("git_credentials");
		expect(result.git_repo_url).toBe("https://git.example.test/repo.git");
		expect(result.certificate.meta).toEqual({});
		expect(result.access_list.meta.note).toBe("kept");
		expect(result.access_list.items).toEqual([{ username: "admin" }]);
		expect(result.meta.note).toBe("kept");
		expect(result.meta.nested.keep).toBe(true);
	});

	it("does not mutate the stored host object", () => {
		const host = {
			id: 1,
			git_credentials: "git-token",
			access_list: { meta: { oidc_client_secret: "oidc-secret" } },
			meta: { token: "meta-token" },
		};
		sanitizeProxyHost(host);
		expect(host.git_credentials).toBe("git-token");
		expect(host.access_list.meta.oidc_client_secret).toBe("oidc-secret");
		expect(host.meta.token).toBe("meta-token");
	});

	it("normalizes JSON-string metadata and secret aliases", () => {
		const meta = JSON.stringify({
			dnsProviderCredentials: "camel-dns-token",
			oauth2ClientSecret: "camel-oauth2-secret",
			terminalPassword: "camel-terminal-password",
			gitCredentials: "camel-git-token",
			note: "kept",
		});
		const result = sanitizeHostMeta(meta);
		const serialized = JSON.stringify(result);
		for (const secret of ["camel-dns-token", "camel-oauth2-secret", "camel-terminal-password", "camel-git-token"]) {
			expect(serialized, secret).not.toContain(secret);
		}
		expect(result.note).toBe("kept");
	});

	it.each([
		["https://user:secret@example.test/repo.git", "https://example.test/repo.git"],
		["https://example.test/repo.git?access_token=secret", "https://example.test/repo.git"],
		["https://example.test/repo.git", "https://example.test/repo.git"],
		["git@example.test:org/repo.git", "git@example.test:org/repo.git"],
	])("strips embedded credentials from repository URL %s", (input, expected) => {
		expect(redactRepositoryUrl(input)).toBe(expected);
	});
});
