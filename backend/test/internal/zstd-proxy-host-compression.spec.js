import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn().mockResolvedValue() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: vi.fn().mockReturnValue("host-token") }));

import internalNginx from "../../internal/nginx.js";

const host = (overrides = {}) => ({
	id: 74,
	enabled: true,
	domain_names: ["compression.example.test"],
	forward_scheme: "http",
	forward_host: "127.0.0.1",
	forward_port: 8080,
	certificate_id: 0,
	access_list_id: 0,
	advanced_config: "",
	meta: {},
	...overrides,
});

const renderProxyHost = async (overrides = {}) => {
	await internalNginx.generateConfig("proxy_host", host(overrides));
	return fs.promises.writeFile.mock.calls.at(-1)[1];
};

describe("Proxy Host Zstd compression", () => {
	beforeEach(() => {
		vi.stubEnv("DISABLE_NGINX_BEAUTIFIER", "true");
		vi.spyOn(fs.promises, "writeFile").mockResolvedValue();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it.each([false, true])("disables Zstd explicitly with Anubis=%s", async (anubis_enabled) => {
		const rendered = await renderProxyHost({ anubis_enabled, zstd_enabled: false });
		const serverBlocks = rendered.split("server {").slice(1);

		expect(serverBlocks).toHaveLength(anubis_enabled ? 2 : 1);
		for (const server of serverBlocks) {
			expect(server).toContain("zstd off;");
			expect(server).toContain("zstd_static off;");
			expect(server).not.toContain("zstd on;");
		}
	});

	it.each([false, true])("enables Zstd only for an opted-in host with Anubis=%s", async (anubis_enabled) => {
		const rendered = await renderProxyHost({ anubis_enabled, zstd_enabled: true });
		const serverBlocks = rendered.split("server {").slice(1);

		expect(serverBlocks).toHaveLength(anubis_enabled ? 2 : 1);
		for (const server of serverBlocks) {
			expect(server).toContain("zstd on;");
			expect(server).toContain("zstd_static on;");
			expect(server).not.toContain("zstd off;");
		}
	});

	it("exposes the opt-in setting through the create and update API contracts", async () => {
		const readJson = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
		const common = readJson("../../schema/common.json");
		const component = readJson("../../schema/components/proxy-host-object.json");
		const create = readJson("../../schema/paths/nginx/proxy-hosts/post.json");
		const update = readJson("../../schema/paths/nginx/proxy-hosts/hostID/put.json");

		expect(common.properties.zstd_enabled).toMatchObject({ default: false, type: "boolean" });
		expect(component.properties.zstd_enabled.$ref).toContain("zstd_enabled");
		expect(create.requestBody.content["application/json"].schema.properties.zstd_enabled.$ref).toContain(
			"zstd_enabled",
		);
		expect(update.requestBody.content["application/json"].schema.properties.zstd_enabled.$ref).toContain(
			"zstd_enabled",
		);
	});
});
