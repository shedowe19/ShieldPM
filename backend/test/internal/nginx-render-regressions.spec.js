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

	it("confines managed static roots and blocks repository metadata", async () => {
		await internalNginx.generateConfig(
			"proxy_host",
			host({ forward_scheme: "path", forward_host: "/data/websites/host-12" }),
		);
		const rendered = fs.promises.writeFile.mock.calls[0][1];
		expect(rendered).toContain("disable_symlinks on;");
		expect(rendered).toContain("location ~ /\\.git(?:/|$)");
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

	it.each([false, true])(
		"renders valid independent limits and quoted OIDC data with Anubis=%s",
		async (anubisEnabled) => {
			await internalNginx.generateConfig(
				"proxy_host",
				host({
					anubis_enabled: anubisEnabled,
					bandwidth_limit: "1m",
					adv_limit_req_rate: 10,
					adv_limit_req_burst: null,
					access_list_id: 4,
					access_list: { meta: { auth_type: "oidc", oidc_client_secret: 'a"\\b\nsecret' } },
				}),
			);
			const rendered = fs.promises.writeFile.mock.calls[0][1];
			expect(rendered).toContain("set $calculated_rate 0;");
			expect(rendered).toContain("local burst = 0");
			expect(rendered).toContain('local key = "12_" .. ngx.var.binary_remote_addr');
			expect(rendered).toContain('client_secret = "a\\034\\092b\\010secret"');
		},
	);

	it.each([false, true])(
		"exempts the Authentik outpost from its own auth subrequest with Anubis=%s",
		async (anubisEnabled) => {
			await internalNginx.generateConfig(
				"proxy_host",
				host({
					anubis_enabled: anubisEnabled,
					access_list_id: 4,
					access_list: {
						meta: { auth_type: "authentik_proxy", authentik_host: "https://auth.example.test" },
					},
				}),
			);
			const rendered = fs.promises.writeFile.mock.calls[0][1];
			expect(rendered.match(/location \/outpost\.goauthentik\.io \{([^}]+)\}/)[1]).toContain("auth_request off;");
		},
	);

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

	it.each([false, true])(
		"requires verified client certificates on HTTP as well as HTTPS with Anubis=%s",
		async (anubisEnabled) => {
			await internalNginx.generateConfig(
				"proxy_host",
				host({
					anubis_enabled: anubisEnabled,
					access_list_id: 4,
					access_list: { mtls_enabled: true, mtls_use_internal: true, meta: {} },
				}),
			);
			const rendered = fs.promises.writeFile.mock.calls[0][1];
			expect(rendered).toContain("if ($ssl_client_verify != SUCCESS) { return 403; }");
			expect(rendered).toContain("ssl_verify_client on;");
		},
	);

	it("does not overwrite an existing configuration when its backup fails", async () => {
		vi.spyOn(fs.promises, "copyFile").mockRejectedValue(
			Object.assign(new Error("permission denied"), { code: "EACCES" }),
		);
		const generate = vi.spyOn(internalNginx, "generateConfig");
		await expect(
			internalNginx.configure(
				{
					query: () => ({
						findById: () => ({ withGraphFetched: async () => host(), forUpdate: async () => host() }),
					}),
				},
				"proxy_host",
				host(),
			),
		).rejects.toThrow("permission denied");
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

	it("does not reactivate a stale snapshot after its host was disabled", async () => {
		for (const method of ["backupConfig", "generateConfig", "test", "deleteBackupConfig", "reload"]) {
			vi.spyOn(internalNginx, method).mockResolvedValue();
		}
		const model = {
			transaction: (callback) => callback({}),
			query: () => ({
				findById: () => ({
					withGraphFetched: async () => host({ enabled: false, is_deleted: false }),
					forUpdate: async () => host({ enabled: false }),
				}),
				where: () => ({ patch: async () => 1 }),
			}),
		};
		await internalNginx.configure(model, "proxy_host", host({ enabled: true }));
		expect(internalNginx.generateConfig).toHaveBeenCalledWith(
			"proxy_host",
			expect.objectContaining({ enabled: false }),
		);
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
		const model = {
			transaction: (callback) => callback({}),
			query: () => ({
				findById: () => ({ withGraphFetched: async () => host(), forUpdate: async () => host() }),
				where: () => ({ patch }),
			}),
		};
		internalAnubis.generatePolicy.mockRejectedValueOnce(new Error("policy unavailable"));
		const meta = await internalNginx.configure(model, "proxy_host", host());
		await Promise.resolve();
		expect(meta.nginx_online).toBe(true);
		expect(restore).not.toHaveBeenCalled();
		expect(internalNginx.reload).toHaveBeenCalledOnce();
	});

	it("restores and reloads the previous configuration when activation fails", async () => {
		for (const method of [
			"backupConfig",
			"generateConfig",
			"test",
			"renameConfigAsError",
			"restoreConfig",
			"deleteBackupConfig",
		]) {
			vi.spyOn(internalNginx, method).mockResolvedValue();
		}
		vi.spyOn(internalNginx, "reload").mockRejectedValueOnce(new Error("reload failed")).mockResolvedValueOnce();
		const patch = vi.fn().mockResolvedValue(1);
		const model = {
			transaction: (callback) => callback({}),
			query: () => ({
				findById: () => ({ withGraphFetched: async () => host(), forUpdate: async () => host() }),
				where: () => ({ patch }),
			}),
		};
		const meta = await internalNginx.configure(model, "proxy_host", host());
		expect(meta.nginx_online).toBe(false);
		expect(internalNginx.restoreConfig).toHaveBeenCalledOnce();
		expect(internalNginx.deleteBackupConfig).not.toHaveBeenCalled();
		expect(internalNginx.reload).toHaveBeenCalledTimes(2);
	});

	it("reloads the restored configuration even when database metadata writes keep failing", async () => {
		for (const method of [
			"backupConfig",
			"generateConfig",
			"test",
			"renameConfigAsError",
			"restoreConfig",
			"reload",
		]) {
			vi.spyOn(internalNginx, method).mockResolvedValue();
		}
		const patch = vi.fn().mockRejectedValue(new Error("database unavailable"));
		const model = {
			transaction: (callback) => callback({}),
			query: () => ({
				findById: () => ({ withGraphFetched: async () => host(), forUpdate: async () => host() }),
				where: () => ({ patch }),
			}),
		};
		await expect(internalNginx.configure(model, "proxy_host", host())).rejects.toThrow("database unavailable");
		expect(internalNginx.restoreConfig).toHaveBeenCalledOnce();
		expect(internalNginx.reload).toHaveBeenCalledTimes(2);
		expect(internalNginx.reload.mock.invocationCallOrder[1]).toBeLessThan(patch.mock.invocationCallOrder[1]);
	});
});
