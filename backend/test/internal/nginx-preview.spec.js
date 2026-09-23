import { describe, expect, it } from "vitest";
import { buildPreviewDiff, redactPreviewConfig } from "../../lib/nginx-preview.js";

describe("configuration preview presentation", () => {
	it("redacts template-rendered OIDC secrets, terminal tokens, and embedded private keys", () => {
		const source = `client_secret = "t\\034ecret",\nproxy_set_header X-ShieldPM-Terminal-Token "token";\n-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----`;
		const result = redactPreviewConfig(source);
		expect(result).not.toContain("t\\034ecret");
		expect(result).not.toContain('token";');
		expect(result).toContain("[REDACTED]");
		expect(result).toContain("[REDACTED PRIVATE KEY]");
	});

	it("shows changes while ignoring beautifier-only indentation", () => {
		const diff = buildPreviewDiff(
			"server {\n  server_name old.test;\n}\n",
			"server {\n    server_name new.test;\n}\n",
		);
		expect(diff).toContain("-server_name old.test;");
		expect(diff).toContain("+server_name new.test;");
		expect(diff).toContain(" server {");
		expect(buildPreviewDiff("  listen 80;\n", "listen 80;\n")).not.toMatch(/^[+-]listen/m);
	});
});
