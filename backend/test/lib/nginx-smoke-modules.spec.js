import { describe, expect, it } from "vitest";
import { resolveNginxSmokeModules } from "../../../scripts/ci/nginx-smoke-modules.mjs";

describe("firewall image smoke module resolution", () => {
	it("loads configured dynamic modules using the binary prefix and NDK before Lua", async () => {
		const files = new Set([
			"/opt/shieldpm/modules/ndk_http_module.so",
			"/opt/shieldpm/modules/ngx_http_lua_module.so",
			"/opt/waf/ngx_http_modsecurity_module.so",
			"/opt/shieldpm/modules/ngx_http_geoip2_module.so",
		]);
		const modules = await resolveNginxSmokeModules({
			version: "configure arguments: --prefix=/opt/shieldpm --modules-path=/opt/shieldpm/modules",
			configuration: `load_module modules/ngx_http_lua_module.so;
load_module /opt/waf/ngx_http_modsecurity_module.so;
load_module modules/ndk_http_module.so;
#load_module modules/ngx_http_geoip2_module.so;
load_module /opt/waf/foreign_module.so;`,
			isFile: async (file) => files.has(file),
		});
		expect(modules).toEqual({
			ndk: "/opt/shieldpm/modules/ndk_http_module.so",
			lua: "/opt/shieldpm/modules/ngx_http_lua_module.so",
			modsecurity: "/opt/waf/ngx_http_modsecurity_module.so",
			geoip2: "/opt/shieldpm/modules/ngx_http_geoip2_module.so",
		});
		expect(Object.keys(modules)).toEqual(["ndk", "lua", "modsecurity", "geoip2"]);
	});

	it("finds installed modules in the binary module path when the master uses includes", async () => {
		const modules = await resolveNginxSmokeModules({
			version: "configure arguments: --prefix='/usr/share/nginx' --modules-path=/usr/lib/nginx/modules",
			configuration: "include /etc/nginx/modules-enabled/*.conf;",
			isFile: async (file) => file === "/usr/lib/nginx/modules/ngx_http_modsecurity_module.so",
		});
		expect(modules).toEqual({ modsecurity: "/usr/lib/nginx/modules/ngx_http_modsecurity_module.so" });
	});

	it("does not invent dynamic paths for a static build or accept unrelated modules", async () => {
		const modules = await resolveNginxSmokeModules({
			version: "configure arguments: --prefix=/usr/local/nginx --add-module=ModSecurity-nginx",
			configuration: "load_module /etc/nginx/modules/unrelated_module.so;",
			isFile: async (file) => file.endsWith("unrelated_module.so"),
		});
		expect(modules).toEqual({});
	});
});
