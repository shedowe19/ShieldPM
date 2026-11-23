import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nginx from "../../internal/nginx.js";
import {
	validateBandwidthLimit,
	validateProxyHostFields,
	validateStreamHostFields,
	validateWebRoot,
} from "../../lib/host-input.js";
import utils from "../../lib/utils.js";

const access = (admin) => ({ isAdmin: async () => admin });

const renderTemplate = (name, data) =>
	utils.getRenderEngine().renderFile(name, {
		env: process.env,
		access_list: { meta: {} },
		access_list_id: 0,
		...data,
	});

/**
 * Decode the decimal escapes emitted by the `luaString` filter without asking
 * the filter under test to explain itself.
 * @param {string} literal
 */
const decodeLuaLiteral = (literal) => {
	expect(literal).toMatch(/^"(?:\\\d{3}|[^"\\])*"$/u);
	return literal.slice(1, -1).replace(/\\(\d{3})/gu, (_, digits) => String.fromCharCode(Number(digits)));
};

const luaLimitLiteral = (rendered) => {
	const line = rendered.split("\n").find((candidate) => candidate.includes("local limit_str ="));
	expect(line, "bandwidth_limit must be emitted as a luaString declaration").toBeDefined();
	return line.trim();
};

describe("host template injection boundaries", () => {
	beforeEach(() => {
		vi.stubEnv("IPV4_BINDING", "0.0.0.0");
		vi.stubEnv("IPV6_BINDING", "[::]");
		vi.stubEnv("DISABLE_IPV6", "false");
		vi.stubEnv("DISABLE_HTTP", "false");
		vi.stubEnv("HTTP_PORT", "80");
		vi.stubEnv("HTTPS_PORT", "443");
		vi.stubEnv("STREAM_LISTEN_LOCALHOST", "false");
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it("serializes a hostile bandwidth_limit as escaped Lua data instead of code", async () => {
		const payload = '1m"; os.execute("id"); --';
		expect(() => validateBandwidthLimit(payload)).toThrow(/bandwidth_limit/);

		// Simulate a legacy row that predates the validator: the renderer must
		// still keep the payload inside one Lua string literal.
		const rendered = await renderTemplate("_proxy_logic.conf", { id: 42, bandwidth_limit: payload });
		const declaration = luaLimitLiteral(rendered);
		expect(declaration).toContain('local limit_str = "1m\\034; os.execute(\\034id\\034); --"');
		expect(decodeLuaLiteral(declaration.slice(declaration.indexOf('"')))).toBe(payload);
		const outsideLiteral = rendered
			.split("\n")
			.filter((line) => line.includes("os.execute") && !line.includes("local limit_str ="));
		expect(outsideLiteral).toEqual([]);
		expect(rendered).not.toContain('local limit_str = "1m"; os.execute("id"); --');
	});

	it.each([
		["top-level forward_query quote/command", { forward_query: 'x=1"; os.execute("id"); --' }, /forward_query/],
		["top-level forward_query variable", { forward_query: "$http_authorization" }, /forward_query/],
		["top-level index_file variable", { index_file: "$http_authorization" }, /index_file/],
		["top-level index_file directive separator", { index_file: "index.html; return 200" }, /index_file/],
		["top-level index_file quote", { index_file: 'index".html' }, /index_file/],
		["top-level index_file traversal", { index_file: "sub/../../etc/passwd" }, /index_file/],
		["location path directive", { locations: [{ path: "/app; return 200" }] }, /location path/],
		["location path quote", { locations: [{ path: '/app"' }] }, /location path/],
		["location forward_query quote", { locations: [{ forward_query: 'x=1"' }] }, /forward_query/],
		["location forward_query variable", { locations: [{ forward_query: "$http_authorization" }] }, /forward_query/],
	])("rejects a malicious %s before a template can render it", async (_, payload, message) => {
		await expect(validateProxyHostFields(access(false), payload)).rejects.toThrow(message);
	});

	it("renders valid custom location values as quoted directives without variable expansion", async () => {
		const rendered = await renderTemplate("_proxy_host_custom_location.conf", {
			path: "/app",
			forward_scheme: "http",
			forward_host: "backend.test",
			forward_port: 8080,
			forward_path: null,
			forward_query: "api_key=123&x=a%20b",
			advanced_config: "",
			access_list_id: 0,
		});
		expect(rendered).toContain("location /app {");
		expect(rendered).toContain('set $args "$args&api_key=123&x=a%20b";');
		expect(rendered).toContain("proxy_pass http://backend.test:8080$uri$is_args$args;");
		expect(rendered).not.toContain("$http_authorization");
		expect(rendered).not.toContain("os.execute");
	});

	it("renders a validated path host with symlink and Git metadata protections", async () => {
		const host = {
			id: 43,
			forward_scheme: "path",
			forward_host: "/data/websites/host-43",
			managed_web_root: true,
			use_default_location: true,
			index_file: "sub/index.html",
			index_dir: "sub",
			php_enabled: false,
		};
		await expect(validateProxyHostFields(access(true), host)).resolves.toBeUndefined();
		const rendered = await renderTemplate("_proxy_logic.conf", host);
		expect(rendered).toContain("root /data/websites/host-43;");
		expect(rendered).toContain("disable_symlinks on;");
		expect(rendered).toContain("location ~ /\\.git(?:/|$) {");
		expect(rendered).toContain("index sub/index.html;");
		expect(rendered).toContain("try_files $uri $uri/ /sub$uri /sub$uri/ =404;");
		expect(rendered).not.toContain("os.execute");
	});

	it("requires administrator privileges before a path host or advanced config can render", async () => {
		await expect(
			validateProxyHostFields(access(false), { forward_scheme: "path", forward_host: "/data" }),
		).rejects.toThrow(/administrator/);
		await expect(
			validateProxyHostFields(access(false), {
				forward_scheme: "http",
				forward_host: "backend.test",
				advanced_config: "alias /data;",
			}),
		).rejects.toThrow(/administrator/);
		// Administrators retain both expert features; the Nginx/Lua character
		// checks still apply after the privilege gate.
		await expect(
			validateProxyHostFields(access(true), { forward_scheme: "path", forward_host: "/var/www/site" }),
		).resolves.toBeUndefined();
		await expect(
			validateProxyHostFields(access(true), {
				forward_scheme: "http",
				forward_host: "backend.test",
				advanced_config: "alias /data;",
			}),
		).resolves.toBeUndefined();
		await expect(
			validateProxyHostFields(access(true), {
				forward_scheme: "path",
				forward_host: "/data/websites/site; os.execute('id')",
			}),
		).rejects.toThrow(/whitespace|control/);
		expect(() => validateWebRoot("/data", { allowPrivate: false })).toThrow(/below/);
	});

	it("rejects unix-socket stream forwarding for delegated users and malformed sockets", async () => {
		const payload = { forwarding_host: "unix:/var/run/docker.sock:" };
		await expect(validateStreamHostFields(access(false), payload)).rejects.toThrow(/unix socket/);
		await expect(
			validateStreamHostFields(access(false), { forwarding_host: "example.com; return 200" }),
		).rejects.toThrow(/whitespace|valid/);
		// The current branch permits a well-formed socket only for administrators,
		// so escape sequences and relative socket paths must still be rejected.
		await expect(
			validateStreamHostFields(access(true), { forwarding_host: "unix:/var/run/../docker.sock:" }),
		).rejects.toThrow(/unix socket/);
		await expect(
			validateStreamHostFields(access(true), { forwarding_host: "unix:relative.sock:" }),
		).rejects.toThrow(/unix socket/);
	});

	it("rejects a dollar sign in a location path", async () => {
		// The custom-location template echoes a trailing-slash path into a
		// `return 301` directive, where Nginx expands `$` variables. A path such
		// as `/$http_authorization/` would otherwise leak the header value.
		await expect(
			validateProxyHostFields(access(false), { locations: [{ path: "/$http_authorization" }] }),
		).rejects.toThrow(/location path/);
		await expect(
			validateProxyHostFields(access(false), { locations: [{ path: "/$http_authorization;" }] }),
		).rejects.toThrow(/location path/);
	});
});

describe("redirect, dead and stream host rendering", () => {
	beforeEach(() => {
		vi.stubEnv("IPV4_BINDING", "0.0.0.0");
		vi.stubEnv("IPV6_BINDING", "[::]");
		vi.stubEnv("DISABLE_IPV6", "false");
		vi.stubEnv("DISABLE_HTTP", "false");
		vi.stubEnv("HTTP_PORT", "80");
		vi.stubEnv("HTTPS_PORT", "443");
		vi.stubEnv("STREAM_LISTEN_LOCALHOST", "false");
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it("renders a proxy host with HTTP/1.1 for websocket upgrades without a pool", async () => {
		const rendered = await renderTemplate("_proxy_logic.conf", {
			id: 42,
			enabled: true,
			use_default_location: true,
			forward_scheme: "http",
			forward_host: "backend.example.test",
			forward_port: 8080,
			forward_path: null,
			forward_query: null,
			bandwidth_limit: null,
			locations: [],
		});
		expect(rendered).toContain("proxy_http_version 1.1;");
	});

	it("renders http2 only when the host enables it", async () => {
		const base = {
			id: 43,
			server_names: ["h2.example.test"],
			certificate: { provider: "letsencrypt" },
			certificate_id: 1,
			http2_support: true,
		};
		const enabled = await renderTemplate("_common.conf", base);
		expect(enabled).toContain("http2 on;");
		const disabled = await renderTemplate("_common.conf", { ...base, http2_support: false });
		expect(disabled).not.toContain("http2 on;");
	});

	it("renders a redirection host with its domain, target and preserved path", async () => {
		const rendered = await nginx.renderConfig("redirection_host", {
			id: 11,
			enabled: true,
			domain_names: ["redirect.example.test"],
			forward_scheme: "https",
			forward_domain_name: "target.example.test",
			forward_http_code: 301,
			preserve_path: true,
			advanced_config: "",
		});
		expect(rendered).toContain("server_name redirect.example.test;");
		expect(rendered).toMatch(/location \/ \{ return 301 https:\/\/target\.example\.test\$request_uri; \}/);
		expect(rendered).toContain("include /data/custom_nginx/server_redirect.conf;");
	});

	it("renders a dead host with the isolated 404 page", async () => {
		const rendered = await nginx.renderConfig("dead_host", {
			id: 12,
			enabled: true,
			domain_names: ["dead.example.test"],
			advanced_config: "",
		});
		expect(rendered).toContain("server_name dead.example.test;");
		expect(rendered).toContain("root /html/404deadpage;");
		expect(rendered).toContain("error_page 404 /404deadpage.html;");
		expect(rendered).toContain("try_files $uri =404;");
	});

	it("renders a TCP stream listener with its public port and upstream", async () => {
		const rendered = await nginx.renderConfig("stream", {
			id: 13,
			enabled: true,
			incoming_port: 25565,
			tcp_forwarding: true,
			udp_forwarding: false,
			forwarding_host: "10.0.0.5",
			forwarding_port: 25565,
			advanced_config: "",
		});
		expect(rendered).toContain("listen 0.0.0.0:25565 deferred so_keepalive=on;");
		expect(rendered).toContain("proxy_pass 10.0.0.5:25565;");
		expect(rendered).toContain("include /data/custom_nginx/server_stream_tcp.conf;");
	});

	it("renders a UDP stream and brackets an IPv6 upstream", async () => {
		const rendered = await nginx.renderConfig("stream", {
			id: 14,
			enabled: true,
			incoming_port: 5353,
			tcp_forwarding: false,
			udp_forwarding: true,
			forwarding_host: "2606:4700:4700::1111",
			forwarding_port: 53,
			advanced_config: "",
		});
		expect(rendered).toContain("listen 0.0.0.0:5353 udp reuseport;");
		expect(rendered).toContain("proxy_pass [2606:4700:4700::1111]:53;");
		expect(rendered).toContain("include /data/custom_nginx/server_stream_udp.conf;");
	});
});
