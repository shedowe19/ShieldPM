import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn().mockResolvedValue() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: vi.fn().mockReturnValue("host-token") }));

import internalAnubis from "../../internal/anubis.js";
import internalNginx from "../../internal/nginx.js";

const host = (overrides = {}) => ({
	id: 12,
	enabled: true,
	domain_names: ["proxy.example.test"],
	forward_scheme: "http",
	forward_host: "127.0.0.1",
	forward_port: 8080,
	certificate_id: 0,
	access_list_id: 0,
	advanced_config: "",
	meta: {},
	...overrides,
});

describe("Nginx configuration regressions", () => {
	beforeEach(() => {
		vi.stubEnv("DISABLE_NGINX_BEAUTIFIER", "true");
		vi.spyOn(fs.promises, "writeFile").mockResolvedValue();
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it("renders one root location when a custom root replaces the default", async () => {
		const source = host({
			locations: [{ path: "/", forward_scheme: "http", forward_host: "other.test", forward_port: 9000 }],
		});
		const original = structuredClone(source);
		await internalNginx.generateConfig("proxy_host", source);
		const rendered = fs.promises.writeFile.mock.calls[0][1];
		expect(rendered.match(/location \/ \{/g)).toHaveLength(1);
		expect(rendered).toContain("http://other.test:9000");
		expect(source).toEqual(original);
	});

	it("renders trailing-slash redirects and aliases for custom static locations", async () => {
		const rendered = await internalNginx.renderLocations(
			host({ locations: [{ path: "/assets/", forward_scheme: "path", forward_host: "/data/assets/" }] }),
		);
		expect(rendered).toContain("location /assets {");
		expect(rendered).toContain("return 301 /assets/;");
		expect(rendered).toContain("alias /data/assets/;");
	});

	it("uses internal certificate files for TLS streams", async () => {
		await internalNginx.generateConfig(
			"stream",
			host({
				incoming_port: 8443,
				tcp_forwarding: true,
				forwarding_host: "127.0.0.1",
				forwarding_port: "443",
				certificate_id: 2,
				certificate: { provider: "internal" },
			}),
		);
		const rendered = fs.promises.writeFile.mock.calls[0][1];
		expect(rendered).toContain("/data/tls/internal/npm-2/privkey.pem");
		expect(rendered).not.toContain("/data/tls/custom/npm-2/");
	});

	it.each([false, true])("retains terminal authentication with Anubis=%s", async (anubisEnabled) => {
		await internalNginx.generateConfig(
			"proxy_host",
			host({
				forward_scheme: "terminal",
				anubis_enabled: anubisEnabled,
				access_list_id: 4,
				access_list: {
					meta: {
						auth_type: "oidc",
						oidc_discovery_url: "https://login.test/.well-known/openid-configuration",
						oidc_client_id: "client",
						oidc_client_secret: "secret",
					},
					items: [{ username: "admin" }],
					clients: [],
				},
			}),
		);
		const rendered = fs.promises.writeFile.mock.calls[0][1];
		const websocketLocation = rendered.match(/location \/ws \{([\s\S]*?)\n\s*\}/)?.[1];
		expect(websocketLocation).toContain('proxy_set_header X-ShieldPM-Terminal-Token "host-token";');
		expect(websocketLocation).not.toContain("auth_basic off");
		expect(rendered).toContain('auth_basic            "Authorization required"');
		expect(rendered).toContain('require("resty.openidc").authenticate(opts)');
		expect(rendered).not.toContain('if ngx.var.uri == "/ws" then return end');
	});

	it("does not overwrite an existing configuration when its backup fails", async () => {
		vi.spyOn(fs.promises, "copyFile").mockRejectedValue(
			Object.assign(new Error("permission denied"), { code: "EACCES" }),
		);
		const generate = vi.spyOn(internalNginx, "generateConfig");
		await expect(internalNginx.configure({}, "proxy_host", host())).rejects.toThrow("permission denied");
		expect(generate).not.toHaveBeenCalled();
	});

	it("serializes concurrent configuration changes", async () => {
		let release;
		const configure = vi
			.spyOn(internalNginx, "configureHost")
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						release = resolve;
					}),
			)
			.mockResolvedValueOnce({ nginx_online: true });
		const first = internalNginx.configure({}, "proxy_host", host());
		const second = internalNginx.configure({}, "proxy_host", host({ id: 13 }));
		await Promise.resolve();
		expect(configure).toHaveBeenCalledTimes(1);
		release({ nginx_online: true });
		await Promise.all([first, second]);
		expect(configure).toHaveBeenCalledTimes(2);
	});

	it("reports config deletion errors instead of claiming the host was disabled", async () => {
		vi.spyOn(fs.promises, "unlink").mockRejectedValue(
			Object.assign(new Error("read-only filesystem"), { code: "EROFS" }),
		);
		await expect(internalNginx.deleteConfig("proxy_host", host())).rejects.toThrow("read-only filesystem");
	});

	it("isolates policy generation failure from an accepted nginx configuration", async () => {
		for (const method of ["backupConfig", "generateConfig", "test", "deleteBackupConfig", "reload"]) {
			vi.spyOn(internalNginx, method).mockResolvedValue();
		}
		const restore = vi.spyOn(internalNginx, "restoreConfig").mockResolvedValue();
		const patch = vi.fn().mockResolvedValue(1);
		const model = { query: () => ({ where: () => ({ patch }) }) };
		internalAnubis.generatePolicy.mockRejectedValueOnce(new Error("policy unavailable"));
		const meta = await internalNginx.configure(model, "proxy_host", host());
		await Promise.resolve();
		expect(meta.nginx_online).toBe(true);
		expect(restore).not.toHaveBeenCalled();
		expect(internalNginx.reload).toHaveBeenCalledOnce();
	});
});
