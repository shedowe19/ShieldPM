import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const readFile = (path) => fs.readFileSync(join(repoRoot, path), "utf8");

const dockerfile = readFile("Dockerfile");
const caddyDockerfile = readFile("caddy/Dockerfile");
const adminHeaders = readFile("rootfs/usr/local/nginx/conf/conf.d/include/shieldpm-admin-security.conf");
const startScript = readFile("rootfs/usr/local/bin/start.sh");

describe("container security hardening", () => {
	it("pins the Caddy and Debian image inputs immutably", () => {
		expect(caddyDockerfile).toMatch(/^ARG DEBIAN_IMAGE=debian:trixie-slim@sha256:[0-9a-f]{64}$/m);
		expect(caddyDockerfile).toMatch(/^FROM caddy:2\.11\.4@sha256:[0-9a-f]{64} AS caddy$/m);
		expect(caddyDockerfile).toContain("COPY --from=caddy /usr/bin/caddy /usr/bin/caddy");
	});

	it("uses an immutable current ShieldPM Nginx base image", () => {
		expect(dockerfile).toMatch(
			/^ARG SHIELDPM_NGINX_IMAGE=ghcr\.io\/shedowe19\/shieldpm-nginx:master@sha256:[0-9a-f]{64}$/m,
		);
	});

	it("keeps build-only node modules out of the final application image", () => {
		expect(dockerfile).toContain("FROM backend AS backend-runtime");
		expect(dockerfile).toContain("yarn install --frozen-lockfile --production=true");
		expect(dockerfile).toContain("rm -rf /runtime-app/node_modules");
		expect(dockerfile).toContain("COPY --from=backend-runtime /runtime-app /app");
		expect(dockerfile).toContain("COPY --from=backend-runtime /app/node_modules /app/node_modules");
		expect(dockerfile).not.toContain("COPY --from=backend  /app      /app");
	});

	it("sets HSTS, CSP and frame protection on the static admin vhost", () => {
		expect(startScript).toContain("include conf.d/include/shieldpm-admin-security.conf;");
		expect(adminHeaders).toContain("Strict-Transport-Security: max-age=31536000; includeSubDomains");
		expect(adminHeaders).toContain("Content-Security-Policy:");
		expect(adminHeaders).toContain("frame-ancestors 'self'");
		expect(adminHeaders).toContain("X-Frame-Options: SAMEORIGIN");
	});
});
