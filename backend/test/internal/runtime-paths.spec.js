vi.mock("../../internal/acme-options.js", () => ({
	default: {
		getPublicPolicy: async () => ({ ocsp_stapling: false, custom_ocsp_stapling: false, default_certificate_id: 0 }),
	},
}));
vi.mock("../../internal/acme-tls.js", () => ({
	default: {
		getDefaultIncludePath: () => "/data/nginx/include/default-tls.conf",
		refreshDefaultInclude: async () => {},
	},
}));

import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/nginx-options.js", () => ({
	default: { getPolicy: async () => ({ beautifier_enabled: false }) },
}));

vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test-token" }));

import nginx from "../../internal/nginx.js";

const backendSource = fs.readFileSync(new URL("../../index.js", import.meta.url), "utf8");
const listener = backendSource.match(/app\.listen\("([^"]+)"/)?.[1];
const render = async (overrides = {}) => {
	await nginx.generateConfig("proxy_host", {
		id: 7,
		enabled: true,
		domain_names: ["example.test"],
		forward_scheme: "http",
		forward_host: "127.0.0.1",
		forward_port: 8080,
		access_list_id: 0,
		...overrides,
	});
	return fs.promises.writeFile.mock.calls.at(-1)[1];
};

describe("service-owned runtime paths", () => {
	beforeEach(() => {
		vi.stubEnv("DISABLE_HTTP", "true");
		vi.spyOn(fs.promises, "writeFile").mockResolvedValue();
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it("keeps the fallback listener and terminal upstream inside the backend runtime directory", async () => {
		const config = await render({ forward_scheme: "terminal" });
		expect(listener).toBe("/run/shieldpm/shieldpm.sock");
		expect(config).toContain("listen unix:/run/shieldpm/nginx-7.sock;");
		expect(config).toContain(`proxy_pass http://unix:${listener}:/nginx/proxy-hosts/7/terminal/ws;`);
	});

	it.each(["82", "83", "84"])("uses the isolated PHP %s socket in default and custom locations", async (version) => {
		const config = await render({
			forward_scheme: "path",
			forward_host: "/data/websites/host-7",
			php_enabled: true,
			php_version: version,
		});
		expect(config).toContain(`fastcgi_pass unix:/run/shieldpm/php${version}.sock;`);
		const custom = await nginx.renderLocations({
			locations: [
				{
					path: "/php",
					forward_scheme: "path",
					forward_host: "/data/websites/host-7",
					forward_port: version,
					forward_path: "/index.php",
				},
			],
		});
		expect(custom).toContain(`fastcgi_pass unix:/run/shieldpm/php${version}.sock;`);
	});

	it("keeps both Anubis sockets and OAuth2 sockets in the same service directory", async () => {
		const config = await render({
			anubis_enabled: true,
			access_list_id: 4,
			access_list: { meta: { auth_type: "oauth2_proxy" }, items: [], clients: [] },
		});
		expect(config).toContain("proxy_pass http://unix:/run/shieldpm/anubis.sock;");
		expect(config).toContain("listen unix:/run/shieldpm/anubis-upstream.sock;");
		expect(config).toContain("http://unix:/run/shieldpm/oauth2-proxy-4.sock");
		const sockets = [...config.matchAll(/unix:(\/run\/[^;:\s]+)/g)].map((match) => match[1]);
		expect(sockets.length).toBeGreaterThan(0);
		expect(sockets.every((socket) => socket.startsWith("/run/shieldpm/"))).toBe(true);
	});

	it("writes the editable default configuration and its backups beneath the data directory", () => {
		expect(nginx.getConfigName("default")).toBe("/data/nginx/default.conf");
	});
});
