import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test-token" }));

import nginx from "../../internal/nginx.js";
import utils from "../../lib/utils.js";

const host = (overrides = {}) => ({
	id: 7,
	enabled: true,
	domain_names: ["example.test"],
	forward_scheme: "http",
	forward_host: "127.0.0.1",
	forward_port: 8080,
	meta: {},
	...overrides,
});

describe("third review Nginx activation and static location regressions", () => {
	let directory;
	beforeEach(async () => {
		directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "shieldpm-third-nginx-"));
		vi.stubEnv("DISABLE_NGINX_BEAUTIFIER", "true");
		vi.spyOn(nginx, "getConfigName").mockImplementation((_type, id) => path.join(directory, `${id}.conf`));
	});
	afterEach(async () => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		await fs.promises.rm(directory, { recursive: true, force: true });
	});
	const model = (enabled = true) => ({
		transaction: (callback) => callback({}),
		query: () => ({
			findById: () => ({
				withGraphFetched: async () => host({ enabled, is_deleted: false }),
				forUpdate: async () => host({ enabled }),
			}),
			where: () => ({ patch: vi.fn().mockResolvedValue(1) }),
		}),
	});
	it("does not restore a stale backup after generating a new host fails", async () => {
		const filename = nginx.getConfigName("proxy_host", 7);
		await fs.promises.writeFile(`${filename}.bak`, "stale active listener");
		vi.spyOn(nginx, "generateConfig").mockRejectedValue(new Error("render failed"));
		await expect(nginx.configure(model(), "proxy_host", host())).rejects.toThrow("render failed");
		expect(fs.existsSync(filename)).toBe(false);
		expect(fs.existsSync(`${filename}.bak`)).toBe(false);
	});
	it.each([true, false])("tests the complete configuration once with deferred reload=%s", async (skipReload) => {
		const commands = vi.spyOn(utils, "execFile").mockResolvedValue("");
		await nginx.configure(model(), "proxy_host", host(), { skip_reload: skipReload });
		expect(commands.mock.calls.filter(([name, args]) => name === "nginx" && args[0] === "-tq")).toHaveLength(1);
		expect(commands.mock.calls.filter(([name, args]) => name === "nginx" && args[0] === "-s")).toHaveLength(
			skipReload ? 0 : 1,
		);
	});
	it("does not report an inactive stale snapshot online after configuration", async () => {
		vi.spyOn(utils, "execFile").mockResolvedValue("");
		const result = await nginx.configure(model(false), "proxy_host", host());
		expect(result.nginx_online).toBe(false);
		expect(await fs.promises.readFile(nginx.getConfigName("proxy_host", 7), "utf8")).not.toContain("server {");
	});
	it("blocks Git metadata and symlinks in a custom managed path below an HTTP upstream", async () => {
		await nginx.generateConfig(
			"proxy_host",
			host({ locations: [{ path: "/site/", forward_scheme: "path", forward_host: "/data/websites/host-7/" }] }),
		);
		const config = await fs.promises.readFile(nginx.getConfigName("proxy_host", 7), "utf8");
		const location = config.slice(config.indexOf("location /site/ {"));
		expect(location).toContain("disable_symlinks on;");
		expect(location).toContain("if ($uri ~ /\\.git(?:/|$)) {");
		expect(location).toContain("return 403;");
		expect(location).toContain("alias /data/websites/host-7/;");
	});
	it("keeps exact custom static locations valid without nested locations", async () => {
		const rendered = await nginx.renderLocations(
			host({
				locations: [{ path: "= /version", forward_scheme: "path", forward_host: "/data/site" }],
			}),
		);
		expect(rendered).toContain("location = /version {");
		expect(rendered).toContain("return 403;");
		expect(rendered.match(/location /g)).toHaveLength(1);
	});

	it("renders maintenance at the exact scheduled start even before the poll updates the active flag", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
		await nginx.generateConfig(
			"proxy_host",
			host({ maintenance_start: "2026-09-08T12:00:00Z", maintenance_end: "2026-09-08T13:00:00Z" }),
		);
		expect(await fs.promises.readFile(nginx.getConfigName("proxy_host", 7), "utf8")).toContain(
			"/maintenance.html =503",
		);
	});
});
