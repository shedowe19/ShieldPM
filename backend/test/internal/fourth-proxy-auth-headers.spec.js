import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test-token" }));

import nginx from "../../internal/nginx.js";

const render = async (overrides = {}) => {
	await nginx.generateConfig("proxy_host", {
		id: 7,
		enabled: true,
		domain_names: ["example.test"],
		forward_scheme: "http",
		forward_host: "127.0.0.1",
		forward_port: 8080,
		access_list_id: 4,
		access_list: { meta: { auth_type: "oauth2_proxy" }, items: [], clients: [] },
		...overrides,
	});
	return fs.promises.writeFile.mock.calls.at(-1)[1];
};

// These forwarding locations contain no nested blocks. Inspect the actual rendered
// location, since Nginx does not merge parent proxy_set_header directives into it.
const locations = (config, route = "/") =>
	[...config.matchAll(/location ([^\n{]+) \{([^}]+)\}/g)]
		.filter((match) => match[1].trim() === route)
		.map((match) => match[2]);

describe("authentication headers at the forwarding location", () => {
	beforeEach(() => {
		vi.stubEnv("DISABLE_NGINX_BEAUTIFIER", "true");
		vi.spyOn(fs.promises, "writeFile").mockResolvedValue();
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it.each(["http", "https", "grpc", "grpcs"])(
		"overrides client-supplied OAuth identity in default and custom %s locations",
		async (scheme) => {
			const config = await render({
				forward_scheme: scheme,
				locations: [{ path: "/api", forward_scheme: scheme, forward_host: "127.0.0.2", forward_port: 8081 }],
			});
			const directive = scheme.startsWith("grpc") ? "grpc_set_header" : "proxy_set_header";
			for (const location of [...locations(config), ...locations(config, "/api")]) {
				for (const [name, value] of [
					["X-User", "$user"],
					["X-Email", "$email"],
					["X-Groups", "$groups"],
					["X-Preferred-Username", "$preferred_username"],
					["X-Access-Token", "$token"],
				]) {
					expect(location).toContain(`${directive} ${name} ${value};`);
				}
			}
		},
	);

	it("applies OAuth identity once at the public Anubis boundary", async () => {
		const config = await render({
			anubis_enabled: true,
			locations: [{ path: "/api", forward_scheme: "http", forward_host: "127.0.0.2", forward_port: 8081 }],
		});
		const [publicLocation, internalLocation] = locations(config);
		expect(publicLocation).toContain("proxy_set_header X-User $user;");
		// The internal server has no auth_request result; it must retain the trusted
		// headers already supplied by the public server through Anubis.
		expect(internalLocation).not.toMatch(/(?:proxy|grpc)_set_header X-User/);
		expect(locations(config, "/api")[0]).not.toMatch(/(?:proxy|grpc)_set_header X-User/);
	});

	it.each([false, true])("strips Basic credentials before forwarding with Anubis=%s", async (anubisEnabled) => {
		const config = await render({
			anubis_enabled: anubisEnabled,
			access_list: { meta: {}, pass_auth: false, items: [{ username: "user" }], clients: [] },
		});
		expect(locations(config)[0]).toContain('proxy_set_header Authorization "";');
	});

	it("keeps terminal WebSocket forwarding subject to Basic credential stripping", async () => {
		const config = await render({
			forward_scheme: "terminal",
			access_list: { meta: {}, pass_auth: false, items: [{ username: "user" }], clients: [] },
		});
		expect(locations(config, "/ws")[0]).toContain('proxy_set_header Authorization "";');
	});

	it("retains the option to forward Basic credentials", async () => {
		const config = await render({
			access_list: { meta: {}, pass_auth: true, items: [{ username: "user" }], clients: [] },
		});
		expect(config).not.toMatch(/proxy_set_header Authorization/);
	});
});
