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

describe("gRPC server addresses do not include request URIs", () => {
	beforeEach(() => {
		vi.spyOn(fs.promises, "writeFile").mockResolvedValue();
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it.each(["grpc", "grpcs"])("renders address-only %s upstreams for default and custom locations", async (scheme) => {
		await nginx.generateConfig("proxy_host", {
			id: 7,
			enabled: true,
			domain_names: ["example.test"],
			forward_scheme: scheme,
			forward_host: "127.0.0.1",
			forward_port: 9000,
			locations: [{ path: "/custom", forward_scheme: scheme, forward_host: "127.0.0.2", forward_port: 9001 }],
		});
		const config = fs.promises.writeFile.mock.calls.at(-1)[1];
		expect([...config.matchAll(/grpc_pass ([^;]+);/g)].map((match) => match[1])).toEqual([
			`${scheme}://127.0.0.1:9000`,
			`${scheme}://127.0.0.2:9001`,
		]);
	});
});
