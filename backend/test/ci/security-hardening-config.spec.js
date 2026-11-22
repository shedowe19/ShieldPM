import fs from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const source = (...segments) => fs.readFileSync(backendSourcePath("..", ...segments), "utf8");
const compose = (name) => load(source(name));

describe("operational security hardening", () => {
	it.each(["compose.yaml", "compose.easy.yaml"])("hardens the main container in %s", (name) => {
		const service = compose(name).services.shieldpm;
		expect(service.security_opt).toContain("no-new-privileges:true");
		expect(service.cap_drop).toContain("ALL");
		expect(service.cap_add).toEqual(expect.arrayContaining(["CHOWN", "SETUID", "NET_BIND_SERVICE"]));
		expect(service.stop_grace_period).toBe("30s");
		expect(service.logging.options).toEqual({ "max-size": "10m", "max-file": "3" });
	});

	it("never exposes the example databases on every interface or ships a default password", () => {
		const text = source("compose.yaml");
		expect(text).toContain('"127.0.0.1:3306:3306"');
		expect(text).toContain('"127.0.0.1:5432:5432"');
		expect(text).not.toContain('"MYSQL_PASSWORD=npm"');
		expect(text).not.toContain('"POSTGRES_PASSWORD=npm"');
		// biome-ignore lint/suspicious/noTemplateCurlyInString: Compose interpolation is literal here.
		expect(text).toContain("${MYSQL_PASSWORD:?set MYSQL_PASSWORD}");
	});

	it("rotates json_access.log with a hard size ceiling and keeps error logging active", () => {
		const logrotate = source("rootfs/etc/logrotate");
		expect(logrotate).toContain("/data/nginx/json_access.log");
		expect(logrotate).toMatch(/json_access\.log \{[\s\S]*maxsize 100M[\s\S]*copytruncate/);
		expect(logrotate).toContain("compress");
		const runtime = source("rootfs/usr/local/bin/runtime-config.sh");
		expect(runtime).toContain("LOGROTATE:-true");
		expect(runtime).not.toContain('("" if enabled("LOGROTATE") else "#") + error_log[2]');
	});

	it("requires an immutable Nginx base image argument", () => {
		const dockerfile = source("Dockerfile");
		expect(dockerfile).toMatch(/ARG SHIELDPM_NGINX_IMAGE\r?\n/);
		expect(dockerfile).not.toMatch(/ARG SHIELDPM_NGINX_IMAGE=/);
		expect(dockerfile).not.toContain("shieldpm-nginx:master");
		// biome-ignore lint/suspicious/noTemplateCurlyInString: Docker build ARG is literal here.
		expect(dockerfile).toContain("FROM ${SHIELDPM_NGINX_IMAGE}");
	});

	it("never runs a PR-built image privileged and bounds artifact retention", () => {
		const workflow = source(".github/workflows/docker.yml");
		expect(workflow).not.toContain("--privileged");
		expect(workflow).toMatch(/Create Proxmox LXC Template[\s\S]*if: github\.event_name != 'pull_request'/);
		expect(workflow).toMatch(/Upload LXC Template[\s\S]*retention-days: 14/);
		expect(workflow).toMatch(/Upload Native Installer[\s\S]*retention-days: 14/);
		expect(workflow).toContain("Resolve pinned Nginx base image");
	});

	it("only promotes a versioned tag that points at the checked-out commit", () => {
		const workflow = source(".github/workflows/docker-latest.yml");
		expect(workflow).toContain("^v[0-9]+\\.[0-9]+\\.[0-9]+$");
		expect(workflow).toContain('"$RELEASE_TAG" == "v$VERSION_FILE"');
		expect(workflow).toContain("does not point at the checked-out commit");
	});

	it("verifies the CrowdSec/OpenAppSec installers and snapshots the database before migrations", () => {
		const installer = source("scripts/install.sh");
		expect(installer).toContain("verify_sha256");
		expect(installer).toContain("CROWDSEC_INSTALL_SHA256");
		expect(installer).toContain("OPENAPPSEC_INSTALL_SHA256");
		expect(installer).toContain("confirm_database_recovery_checkpoint");
		const checkpointCall = installer.indexOf("if ! confirm_database_recovery_checkpoint");
		const migrations = installer.search(/INSTALL_ROLLBACK=false\r?\nINSTALL_MIGRATIONS_STARTED=true/);
		expect(checkpointCall).toBeGreaterThan(0);
		expect(migrations).toBeGreaterThan(checkpointCall);
	});

	it("keeps baseline security headers for every TLS-forced host", () => {
		const common = source("backend/templates/_common.conf");
		expect(common.indexOf("X-Content-Type-Options")).toBeLessThan(common.indexOf("{% if hsts_enabled %}"));
		expect(common).toContain('more_set_headers "Referrer-Policy: strict-origin-when-cross-origin";');
	});

	it("supports an explicit localhost-only stream bind", () => {
		const template = source("backend/templates/stream.conf");
		expect(template).toContain("STREAM_LISTEN_LOCALHOST");
		expect(template).toContain('{% assign stream_ipv4 = "127.0.0.1" %}');
	});

	it("serves the terminal page with a same-origin token request and wss subprotocol", () => {
		const page = source("rootfs/html/terminal/index.html");
		expect(page).toContain("requestSessionToken");
		expect(page).toContain("'https:' ? 'wss:' : 'ws:'");
		expect(page).toContain("shieldpm-terminal.");
		expect(page).not.toContain("x-shieldpm-terminal-token");
	});

	it("rejects external terminal assets without SRI and bundles xterm locally", () => {
		const page = source("rootfs/html/terminal/index.html");
		const tags = page.match(/<(?:script|link)\b[^>]*>/giu) || [];
		for (const tag of tags) {
			const url = /\b(?:src|href)="([^"]+)"/u.exec(tag)?.[1] || "";
			if (!/^(?:https?:)?\/\//u.test(url)) continue;
			expect(tag, `external asset without integrity: ${url}`).toMatch(/\bintegrity="sha(?:256|384|512)-/u);
		}
		expect(page).not.toMatch(/cdn\.jsdelivr\.net|fonts\.googleapis\.com|unpkg\.com/u);
		for (const asset of ["xterm.js", "xterm.css", "addon-fit.js", "addon-web-links.js"]) {
			expect(page).toContain(`/vendor/${asset}`);
		}
		const dockerfile = source("Dockerfile");
		for (const asset of [
			"node_modules/@xterm/xterm/lib/xterm.js",
			"node_modules/@xterm/xterm/css/xterm.css",
			"node_modules/@xterm/addon-fit/lib/addon-fit.js",
			"node_modules/@xterm/addon-web-links/lib/addon-web-links.js",
		]) {
			expect(dockerfile).toContain(asset);
		}
	});

	it("never renders an unvalidated Authentik proxy target", () => {
		for (const template of ["backend/templates/proxy_host.conf", "backend/templates/_proxy_logic.conf"]) {
			const text = source(template);
			expect(text).not.toContain("proxy_pass {{ access_list.meta.authentik_host }}");
			expect(text).toContain("authentikOrigin");
		}
	});
});
