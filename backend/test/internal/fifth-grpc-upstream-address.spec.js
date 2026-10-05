import fs from "node:fs";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import apiValidator from "../../lib/validator/api.js";
import { getCompiledSchema, getValidationSchema } from "../../schema/index.js";

vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test-token" }));

import nginx from "../../internal/nginx.js";

describe("gRPC server addresses do not include request URIs", () => {
	beforeAll(async () => {
		await getCompiledSchema();
	});
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

	it.each(
		["grpc", "grpcs"].flatMap((scheme) =>
			[
				["::1", "[::1]"],
				["::ffff:127.0.0.1", "[::ffff:127.0.0.1]"],
				["[::1]", "[::1]"],
				["127.0.0.1", "127.0.0.1"],
				["upstream.test", "upstream.test"],
			].map(([address, renderedAddress]) => ({ scheme, address, renderedAddress })),
		),
	)(
		"renders accepted $scheme $address for default/custom without changing saved input",
		async ({ scheme, address, renderedAddress }) => {
			const payload = {
				domain_names: ["example.test"],
				forward_scheme: scheme,
				forward_host: address,
				forward_port: 9000,
				locations: [{ path: "/custom", forward_scheme: scheme, forward_host: address, forward_port: 9001 }],
			};
			await apiValidator(getValidationSchema("/nginx/proxy-hosts", "post"), payload);
			const original = structuredClone(payload);
			await nginx.generateConfig("proxy_host", { ...payload, id: 7, enabled: true });
			const config = fs.promises.writeFile.mock.calls.at(-1)[1];
			expect([...config.matchAll(/grpc_pass ([^;]+);/g)].map((match) => match[1])).toEqual([
				`${scheme}://${renderedAddress}:9000`,
				`${scheme}://${renderedAddress}:9001`,
			]);
			expect(payload).toEqual(original);
		},
	);
});
