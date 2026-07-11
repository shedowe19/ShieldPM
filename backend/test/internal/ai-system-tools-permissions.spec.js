import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	fetchIpRanges: vi.fn(),
	reloadNginx: vi.fn(),
	testNginx: vi.fn(),
}));

vi.mock("../../internal/ip_ranges.js", () => ({
	default: { fetch: mocks.fetchIpRanges },
}));
vi.mock("../../internal/nginx.js", () => ({
	default: {
		reload: mocks.reloadNginx,
		test: mocks.testNginx,
	},
}));
vi.mock("../../lib/config.js", () => ({
	getEncryptionKey: vi.fn().mockReturnValue("0".repeat(64)),
	isDemoMode: vi.fn().mockReturnValue(false),
}));
vi.mock("../../models/cloudflared_tunnel.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../models/tor_onion.js", () => ({ default: {} }));
vi.mock("../../internal/access-list.js", () => ({ default: {} }));
vi.mock("../../internal/audit-log.js", () => ({ default: {} }));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/ddns-provider.js", () => ({ default: {} }));
vi.mock("../../internal/dead-host.js", () => ({ default: {} }));
vi.mock("../../internal/maintenance.js", () => ({ default: {} }));
vi.mock("../../internal/pki.js", () => ({ default: {} }));
vi.mock("../../internal/proxy-host.js", () => ({ default: {} }));
vi.mock("../../internal/redirection-host.js", () => ({ default: {} }));
vi.mock("../../internal/report.js", () => ({ default: {} }));
vi.mock("../../internal/setting.js", () => ({ default: {} }));
vi.mock("../../internal/stream.js", () => ({ default: {} }));
vi.mock("../../internal/token.js", () => ({ default: {} }));
vi.mock("../../internal/tor.js", () => ({ default: {} }));
vi.mock("../../internal/user.js", () => ({ default: {} }));

import { executeTools } from "../../internal/ai/executor.js";
import { getToolDefinitions } from "../../internal/ai/tools.js";

const systemToolNames = ["test_nginx_config", "force_nginx_reload", "renew_ip_ranges"];

const namesOf = (tools) => tools.map((tool) => tool.function.name);

const systemToolCalls = systemToolNames.map((name) => ({ name, args: {} }));

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

describe("AI system tool permissions", () => {
	afterAll(() => {
		consoleErrorSpy.mockRestore();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.fetchIpRanges.mockResolvedValue();
		mocks.reloadNginx.mockResolvedValue();
		mocks.testNginx.mockResolvedValue();
	});

	it("does not advertise global Nginx or IP-range tools to users without settings:update", async () => {
		const access = { can: vi.fn().mockRejectedValue(new Error("Not allowed")) };

		const toolNames = namesOf(await getToolDefinitions(access));

		expect(toolNames).not.toEqual(expect.arrayContaining(systemToolNames));
		expect(toolNames).toContain("get_proxy_hosts");
	});

	it("advertises global Nginx and IP-range tools to users with settings:update", async () => {
		const access = { can: vi.fn().mockResolvedValue(true) };

		const toolNames = namesOf(await getToolDefinitions(access));

		expect(toolNames).toEqual(expect.arrayContaining(systemToolNames));
		expect(access.can).toHaveBeenCalledWith("settings:update");
	});

	it("does not execute global Nginx or IP-range tools without settings:update", async () => {
		const access = { can: vi.fn().mockRejectedValue(new Error("Not allowed")) };

		const results = await executeTools(access, systemToolCalls);

		expect(results.map((result) => result.result)).toEqual([
			"Error: Not allowed",
			"Error: Not allowed",
			"Error: Not allowed",
		]);
		expect(mocks.testNginx).not.toHaveBeenCalled();
		expect(mocks.reloadNginx).not.toHaveBeenCalled();
		expect(mocks.fetchIpRanges).not.toHaveBeenCalled();
	});

	it("executes global Nginx and IP-range tools for users with settings:update", async () => {
		const access = { can: vi.fn().mockResolvedValue(true) };

		const results = await executeTools(access, systemToolCalls);

		expect(results.map((result) => result.result)).toEqual([
			"Nginx configuration is valid.",
			"Nginx Reloaded",
			"IP Ranges renewal triggered.",
		]);
		expect(mocks.testNginx).toHaveBeenCalledOnce();
		expect(mocks.reloadNginx).toHaveBeenCalledOnce();
		expect(mocks.fetchIpRanges).toHaveBeenCalledOnce();
		expect(access.can).toHaveBeenCalledTimes(3);
		expect(access.can).toHaveBeenNthCalledWith(1, "settings:update");
		expect(access.can).toHaveBeenNthCalledWith(2, "settings:update");
		expect(access.can).toHaveBeenNthCalledWith(3, "settings:update");
	});
});
