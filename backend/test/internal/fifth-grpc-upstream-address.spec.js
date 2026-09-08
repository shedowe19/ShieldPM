import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test-token" }));

import nginx from "../../internal/nginx.js";

describe("gRPC server addresses do not include request URIs", () => {
	beforeEach(() => {
		vi.stubEnv("DISABLE_NGINX_BEAUTIFIER", "true");
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
