import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getAuditLog: vi.fn(),
	createClientCertificate: vi.fn(),
	fetchIpRanges: vi.fn(),
	getCertificate: vi.fn(),
	getNetworkStats: vi.fn(),
	renewCertificate: vi.fn(),
	reloadNginx: vi.fn(),
	requestCertbot: vi.fn(),
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
vi.mock("systeminformation", () => ({ default: { networkStats: mocks.getNetworkStats } }));
vi.mock("../../lib/config.js", () => ({
	getEncryptionKey: vi.fn().mockReturnValue("0".repeat(64)),
	getPrivateKey: vi.fn().mockReturnValue("ai-confirmation-test-key"),
	isDemoMode: vi.fn().mockReturnValue(false),
}));
vi.mock("../../models/cloudflared_tunnel.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../models/tor_onion.js", () => ({ default: {} }));
vi.mock("../../internal/access-list.js", () => ({ default: {} }));
vi.mock("../../internal/audit-log.js", () => ({ default: { getAll: mocks.getAuditLog } }));
vi.mock("../../internal/certificate.js", () => ({
	default: {
		get: mocks.getCertificate,
		renew: mocks.renewCertificate,
		requestCertbot: mocks.requestCertbot,
	},
}));
vi.mock("../../internal/ddns-provider.js", () => ({ default: {} }));
vi.mock("../../internal/dead-host.js", () => ({ default: {} }));
vi.mock("../../internal/maintenance.js", () => ({ default: {} }));
vi.mock("../../internal/pki.js", () => ({ default: { createClientCert: mocks.createClientCertificate } }));
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
const systemStatusToolName = "get_system_status";
const auditLogToolName = "get_audit_log";
const clientCertificateToolName = "create_client_certificate";
const certificateRenewalToolName = "renew_certificate";

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
		mocks.getAuditLog.mockResolvedValue([]);
		mocks.getNetworkStats.mockResolvedValue([]);
		mocks.getCertificate.mockResolvedValue({ provider: "letsencrypt" });
		mocks.reloadNginx.mockResolvedValue();
		mocks.renewCertificate.mockImplementation(async (access, data) => {
			await access.can("certificates:update", data);
			return { id: data.id };
		});
		mocks.requestCertbot.mockResolvedValue();
		mocks.testNginx.mockResolvedValue();
		mocks.createClientCertificate.mockResolvedValue("/tmp/client.p12");
	});

	it("does not advertise global Nginx or IP-range tools to users without settings:update", async () => {
		const access = { can: vi.fn().mockRejectedValue(new Error("Not allowed")) };

		const toolNames = namesOf(await getToolDefinitions(access));

		expect(toolNames).not.toEqual(expect.arrayContaining(systemToolNames));
		expect(toolNames).not.toContain("get_proxy_hosts");
	});

	it("advertises global Nginx and IP-range tools to users with settings:update", async () => {
		const access = { can: vi.fn().mockResolvedValue(true) };

		const toolNames = namesOf(await getToolDefinitions(access));

		expect(toolNames).toEqual(expect.arrayContaining(systemToolNames));
		expect(access.can).toHaveBeenCalledWith("settings:update");
	});

	it("does not advertise the system-status tool without analytics:list", async () => {
		const access = {
			can: vi.fn().mockImplementation((permission) => {
				if (permission === "analytics:list") return Promise.reject(new Error("Not allowed"));
				return Promise.resolve(true);
			}),
		};

		const toolNames = namesOf(await getToolDefinitions(access));

		expect(toolNames).not.toContain(systemStatusToolName);
	});

	it("does not execute system-status requests without analytics:list", async () => {
		const access = { can: vi.fn().mockRejectedValue(new Error("Not allowed")) };

		const results = await executeTools(access, [{ name: systemStatusToolName, args: {} }]);

		expect(results.map((result) => result.result)).toEqual(["Error: Not allowed"]);
	});

	it("does not advertise or read audit logs without auditlog:list", async () => {
		const access = {
			can: vi.fn().mockImplementation((permission) => {
				if (permission === "auditlog:list") return Promise.reject(new Error("Not allowed"));
				return Promise.resolve(true);
			}),
		};

		const toolNames = namesOf(await getToolDefinitions(access));
		const results = await executeTools(access, [{ name: auditLogToolName, args: {} }]);

		expect(toolNames).not.toContain(auditLogToolName);
		expect(results.map((result) => result.result)).toEqual(["Error: Not allowed"]);
		expect(mocks.getAuditLog).not.toHaveBeenCalled();
	});

	it("returns system status to users with analytics:list", async () => {
		const access = { can: vi.fn().mockResolvedValue(true) };
		mocks.getNetworkStats.mockResolvedValue([{ rx_sec: 12, tx_sec: 8 }]);

		const results = await executeTools(access, [{ name: systemStatusToolName, args: {} }]);

		expect(results.map((result) => result.result)).toEqual([
			JSON.stringify({ rx_sec: 12, tx_sec: 8, total_sec: 20 }),
		]);
		expect(access.can).toHaveBeenCalledWith("analytics:list");
		expect(mocks.getNetworkStats).toHaveBeenCalledOnce();
	});

	it("does not advertise or execute client certificate generation without certificates:create", async () => {
		const access = { can: vi.fn().mockRejectedValue(new Error("Not allowed")) };

		const toolNames = namesOf(await getToolDefinitions(access));
		const results = await executeTools(access, [
			{ name: clientCertificateToolName, args: { common_name: "agent", password: "x" } },
		]);

		expect(toolNames).not.toContain(clientCertificateToolName);
		expect(results.map((result) => result.result)).toEqual([
			"Error: Unknown or unauthorized AI tool: create_client_certificate",
		]);
		expect(mocks.createClientCertificate).not.toHaveBeenCalled();
	});

	it("never advertises or executes secret-bearing client certificate generation", async () => {
		const access = { can: vi.fn().mockResolvedValue(true) };

		const toolNames = namesOf(await getToolDefinitions(access));
		const results = await executeTools(access, [
			{ name: clientCertificateToolName, args: { common_name: "agent", password: "x", years: 2 } },
		]);

		expect(toolNames).not.toContain(clientCertificateToolName);
		expect(results.map((result) => result.result)).toEqual([
			"Error: Unknown or unauthorized AI tool: create_client_certificate",
		]);
		expect(mocks.createClientCertificate).not.toHaveBeenCalled();
	});

	it("does not advertise or start certificate renewal without certificates:update", async () => {
		const access = {
			can: vi.fn().mockImplementation((permission) => {
				if (permission === "certificates:update") return Promise.reject(new Error("Not allowed"));
				return Promise.resolve(true);
			}),
		};

		const toolNames = namesOf(await getToolDefinitions(access));
		const results = await executeTools(access, [{ name: certificateRenewalToolName, args: { id: 42 } }]);

		expect(toolNames).not.toContain(certificateRenewalToolName);
		expect(results.map((result) => result.result)).toEqual(["Error: Not allowed"]);
		expect(mocks.renewCertificate).not.toHaveBeenCalled();
		expect(mocks.requestCertbot).not.toHaveBeenCalled();
	});

	it("advertises and delegates certificate renewal to the authorized certificate service", async () => {
		const access = { can: vi.fn().mockResolvedValue(true) };

		const toolNames = namesOf(await getToolDefinitions(access));
		const results = await executeTools(access, [{ name: certificateRenewalToolName, args: { id: 42 } }]);

		expect(toolNames).toContain(certificateRenewalToolName);
		expect(results.map((result) => result.result)).toEqual(["Renewed Certificate ID: 42"]);
		expect(mocks.renewCertificate).toHaveBeenCalledWith(access, { id: 42 });
		expect(mocks.requestCertbot).not.toHaveBeenCalled();
	});

	it("does not execute global Nginx or IP-range tools without settings:update", async () => {
		const access = { can: vi.fn().mockRejectedValue(new Error("Not allowed")) };

		const results = await executeTools(access, systemToolCalls);

		// A batch containing a high-impact action is rejected before any of its
		// earlier calls run, so an unauthorized reload cannot be hidden behind reads.
		expect(results.map((result) => result.result)).toEqual(["Error: Not allowed"]);
		expect(mocks.testNginx).not.toHaveBeenCalled();
		expect(mocks.reloadNginx).not.toHaveBeenCalled();
		expect(mocks.fetchIpRanges).not.toHaveBeenCalled();
	});

	it("executes safe global tools and requires confirmation for Nginx reload", async () => {
		const access = { can: vi.fn().mockResolvedValue(true) };

		const safeResults = [
			...(await executeTools(access, [systemToolCalls[0]])),
			...(await executeTools(access, [systemToolCalls[2]])),
		];
		const reloadResults = await executeTools({ ...access, token: { getUserId: vi.fn().mockReturnValue(1) } }, [
			systemToolCalls[1],
		]);

		expect(safeResults.map((result) => result.result)).toEqual([
			"Nginx configuration is valid.",
			"IP Ranges renewal triggered.",
		]);
		expect(reloadResults[0].confirmation).toEqual({
			tool: "force_nginx_reload",
			token: expect.any(String),
			details: "{}",
		});
		expect(mocks.testNginx).toHaveBeenCalledOnce();
		expect(mocks.reloadNginx).not.toHaveBeenCalled();
		expect(mocks.fetchIpRanges).toHaveBeenCalledOnce();
		expect(access.can).toHaveBeenCalledTimes(3);
		expect(access.can).toHaveBeenNthCalledWith(1, "settings:update");
		expect(access.can).toHaveBeenNthCalledWith(2, "settings:update");
		expect(access.can).toHaveBeenNthCalledWith(3, "settings:update");
	});
});
