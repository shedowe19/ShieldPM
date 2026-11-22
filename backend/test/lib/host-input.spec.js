import { describe, expect, it } from "vitest";
import {
	validateAdvancedConfig,
	validateBandwidthLimit,
	validateForwardQuery,
	validateIndexFile,
	validateLocationPath,
	validateProxyHostFields,
	validateRedirectionHostFields,
	validateStreamHostFields,
	validateUpstreamHost,
	validateWebRoot,
} from "../../lib/host-input.js";

const access = (admin) => ({ isAdmin: async () => admin });

describe("host input validation", () => {
	it("allows public upstreams for delegated users and rejects internal targets", () => {
		expect(validateUpstreamHost("example.com", { allowPrivate: false })).toBe("example.com");
		expect(validateUpstreamHost("8.8.8.8", { allowPrivate: false })).toBe("8.8.8.8");
		expect(validateUpstreamHost("2606:4700:4700::1111", { allowPrivate: false })).toBe("2606:4700:4700::1111");
		expect(() => validateUpstreamHost("127.0.0.1", { allowPrivate: false })).toThrow(/loopback|private/);
		expect(() => validateUpstreamHost("169.254.169.254", { allowPrivate: false })).toThrow(/loopback|private/);
		expect(() => validateUpstreamHost("10.0.0.5", { allowPrivate: false })).toThrow(/loopback|private/);
		expect(() => validateUpstreamHost("localhost", { allowPrivate: false })).toThrow(/localhost/);
		expect(() => validateUpstreamHost("nextcloud", { allowPrivate: false })).toThrow(/fully-qualified/);
		expect(validateUpstreamHost("127.0.0.1", { allowPrivate: true })).toBe("127.0.0.1");
		expect(validateUpstreamHost("nextcloud", { allowPrivate: true })).toBe("nextcloud");
	});

	it("rejects unix sockets for delegated users and Nginx syntax in upstreams", () => {
		expect(() => validateUpstreamHost("unix:/var/run/docker.sock:")).toThrow(/unix socket/);
		expect(validateUpstreamHost("unix:/var/run/docker.sock:", { allowPrivate: true })).toBe(
			"unix:/var/run/docker.sock:",
		);
		expect(() => validateUpstreamHost('example.com"; os.execute("id")')).toThrow(/whitespace|valid/);
		expect(() => validateUpstreamHost("example.com; return 200")).toThrow(/whitespace|valid/);
		expect(() => validateUpstreamHost("http://example.com")).toThrow(/scheme/);
	});

	it("confines path roots to the managed web root for delegated users", () => {
		expect(validateWebRoot("/data/websites/site", { allowPrivate: false })).toBe("/data/websites/site");
		expect(() => validateWebRoot("/data", { allowPrivate: false })).toThrow(/below/);
		expect(() => validateWebRoot("/data/websites/../keys.json", { allowPrivate: false })).toThrow(/\.\./);
		expect(validateWebRoot("/var/www/site", { allowPrivate: true })).toBe("/var/www/site");
	});

	it("validates values interpolated into Nginx and Lua", () => {
		expect(validateBandwidthLimit("10m")).toBe("10m");
		expect(() => validateBandwidthLimit('1m"; os.execute("id"); --')).toThrow(/bandwidth_limit/);
		expect(validateForwardQuery("api_key=123&x=a%20b")).toBe("api_key=123&x=a%20b");
		expect(() => validateForwardQuery('x=1"')).toThrow(/forward_query/);
		expect(() => validateForwardQuery("$http_authorization")).toThrow(/forward_query/);
		expect(validateIndexFile("index.html")).toBe("index.html");
		expect(validateIndexFile("sub/index.html")).toBe("sub/index.html");
		expect(() => validateIndexFile("../../etc/passwd")).toThrow(/index_file/);
		expect(validateLocationPath("/app")).toBe("/app");
		expect(() => validateLocationPath("/app; return 200")).toThrow(/location path/);
		expect(() => validateLocationPath("~ ^/app")).toThrow(/location path/);
		expect(() => validateLocationPath("/$http_authorization")).toThrow(/location path/);
	});

	it("reserves advanced configuration and path forwarding for administrators", async () => {
		await expect(validateAdvancedConfig(access(false), "alias /data;")).rejects.toThrow(/administrator/);
		await expect(validateAdvancedConfig(access(true), "alias /data;")).resolves.toBe("alias /data;");
		await expect(
			validateProxyHostFields(access(false), { forward_scheme: "path", forward_host: "/data/websites/site" }),
		).rejects.toThrow(/administrator/);
		await expect(
			validateProxyHostFields(access(true), { forward_scheme: "path", forward_host: "/var/www/site" }),
		).resolves.toBeUndefined();
	});

	it("rejects nested advanced configuration for delegated users", async () => {
		await expect(
			validateProxyHostFields(access(false), {
				locations: [
					{
						path: "/app",
						forward_scheme: "http",
						forward_host: "example.com",
						forward_port: 80,
						advanced_config: "alias /data;",
					},
				],
			}),
		).rejects.toThrow(/administrator/);
	});

	it("requires TLS for terminal hosts", async () => {
		await expect(
			validateProxyHostFields(access(true), {
				forward_scheme: "terminal",
				forward_host: "example.com",
				ssl_forced: false,
			}),
		).rejects.toThrow(/TLS/);
		await expect(
			validateProxyHostFields(access(true), {
				forward_scheme: "terminal",
				forward_host: "example.com",
				ssl_forced: true,
				certificate_id: 4,
			}),
		).resolves.toBeUndefined();
	});

	it("validates redirection and stream fields", async () => {
		await expect(
			validateRedirectionHostFields(access(false), { forward_domain_name: "example.com" }),
		).resolves.toBeUndefined();
		await expect(
			validateRedirectionHostFields(access(false), { forward_domain_name: "example.com; return 200" }),
		).rejects.toThrow(/whitespace/);
		await expect(
			validateStreamHostFields(access(false), { forwarding_host: "unix:/var/run/docker.sock:" }),
		).rejects.toThrow(/unix socket/);
		await expect(validateStreamHostFields(access(false), { forwarding_port: 70000 })).rejects.toThrow(/65535/);
		await expect(
			validateRedirectionHostFields(access(true), { forward_domain_name: "unix:/var/run/docker.sock:" }),
		).rejects.toThrow(/unix socket/);
	});
});
