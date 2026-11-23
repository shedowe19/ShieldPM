import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	addAuditLog: vi.fn(),
	createAccessList: vi.fn(),
	createProxyHost: vi.fn(),
	createUser: vi.fn(),
	deleteProxyHost: vi.fn(),
	getAllAuditLog: vi.fn(),
	getAllCertificate: vi.fn(),
	getLogs: vi.fn(),
	reloadNginx: vi.fn(),
	testNginx: vi.fn(),
	updateProxyHost: vi.fn(),
	updateSetting: vi.fn(),
	validateCertificate: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({
	getEncryptionKey: vi.fn().mockReturnValue("0".repeat(64)),
	isDemoMode: vi.fn().mockReturnValue(false),
}));
vi.mock("../../models/cloudflared_tunnel.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../models/tor_onion.js", () => ({ default: {} }));
vi.mock("../../internal/access-list.js", () => ({ default: { create: mocks.createAccessList } }));
vi.mock("../../internal/audit-log.js", () => ({
	default: { add: mocks.addAuditLog, getAll: mocks.getAllAuditLog },
}));
vi.mock("../../internal/certificate.js", () => ({
	default: {
		delete: vi.fn(),
		getAll: mocks.getAllCertificate,
		validate: mocks.validateCertificate,
	},
}));
vi.mock("../../internal/cloudflared.js", () => ({ default: {} }));
vi.mock("../../internal/ddns-provider.js", () => ({ default: {} }));
vi.mock("../../internal/dead-host.js", () => ({ default: {} }));
vi.mock("../../internal/ip_ranges.js", () => ({ default: {} }));
vi.mock("../../internal/maintenance.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({
	default: { getLogs: mocks.getLogs, reload: mocks.reloadNginx, test: mocks.testNginx },
}));
vi.mock("../../internal/pki.js", () => ({ default: {} }));
vi.mock("../../internal/proxy-host.js", () => ({
	default: {
		create: mocks.createProxyHost,
		delete: mocks.deleteProxyHost,
		update: mocks.updateProxyHost,
	},
}));
vi.mock("../../internal/redirection-host.js", () => ({ default: {} }));
vi.mock("../../internal/report.js", () => ({ default: {} }));
vi.mock("../../internal/setting.js", () => ({ default: { update: mocks.updateSetting } }));
vi.mock("../../internal/stream.js", () => ({ default: {} }));
vi.mock("../../internal/token.js", () => ({ default: {} }));
vi.mock("../../internal/tor.js", () => ({ default: {} }));
vi.mock("../../internal/user.js", () => ({ default: { create: mocks.createUser } }));

import { executeTools } from "../../internal/ai/executor.js";
import errs from "../../lib/error.js";

const access = () => ({ can: vi.fn().mockResolvedValue(true), token: { getUserId: () => 7 } });

describe("AI tool contract enforcement", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.validateCertificate.mockResolvedValue({ certificate: { valid: true } });
		mocks.getLogs.mockResolvedValue(Array.from({ length: 200 }, (_, index) => `line ${index}`).join("\n"));
		mocks.getAllAuditLog.mockResolvedValue(
			Array.from({ length: 200 }, (_, index) => ({ action: "updated", user: null, created_on: index })),
		);
	});

	it("rejects unknown top-level arguments before the service is called", async () => {
		const [result] = await executeTools(access(), [{ name: "delete_proxy_host", args: { id: 1, force: true } }]);

		expect(result.result).toContain("must NOT have additional properties");
		expect(mocks.deleteProxyHost).not.toHaveBeenCalled();
	});

	it("rejects values outside the advertised enum", async () => {
		const [result] = await executeTools(access(), [
			{
				name: "create_proxy_host",
				args: {
					domain_names: ["example.com"],
					forward_scheme: "path",
					forward_host: "10.0.0.5",
					forward_port: 3000,
				},
			},
		]);

		expect(result.result).toContain("must be equal to one of the allowed values");
		expect(mocks.createProxyHost).not.toHaveBeenCalled();
	});

	it("rejects missing required arguments", async () => {
		const [result] = await executeTools(access(), [{ name: "delete_proxy_host", args: {} }]);
		expect(result.result).toContain("must have required property 'id'");
		expect(mocks.deleteProxyHost).not.toHaveBeenCalled();
	});

	it("rejects tools that are not advertised to the caller", async () => {
		const [result] = await executeTools(access(), [{ name: "login_as_user", args: { id: 5 } }]);
		expect(result.result).toContain("Tool not permitted");
	});

	it("requires certificates:create before validate_certificate parses anything", async () => {
		const denied = {
			can: vi.fn(async (permission) => {
				if (permission === "certificates:create") throw new errs.PermissionError("No certificate access");
				return true;
			}),
			token: { getUserId: () => 7 },
		};
		const [result] = await executeTools(denied, [
			{
				name: "validate_certificate",
				args: { certificate: "cert", certificate_key: "key" },
			},
		]);
		expect(result.result).toBe("Error: No certificate access");
		expect(mocks.validateCertificate).not.toHaveBeenCalled();

		const [allowed] = await executeTools(access(), [
			{ name: "validate_certificate", args: { certificate: "cert", certificate_key: "key" } },
		]);
		expect(allowed.result).toContain('"valid": true');
		expect(mocks.validateCertificate).toHaveBeenCalledOnce();
	});

	it("does not let the agent rewrite its own ai-config setting", async () => {
		const [result] = await executeTools(access(), [
			{ name: "update_global_setting", args: { id: "ai-config", value: "disabled" } },
		]);
		expect(result.result).toContain("can only be changed by an administrator");
		expect(mocks.updateSetting).not.toHaveBeenCalled();

		const [allowed] = await executeTools(access(), [
			{ name: "update_global_setting", args: { id: "default-site", value: "html" } },
		]);
		expect(allowed.result).toBe("Updated Setting: default-site");
		expect(mocks.updateSetting).toHaveBeenCalledWith(expect.anything(), {
			id: "default-site",
			value: "html",
		});
	});

	it("clamps read_nginx_logs and honors the audit-log limit", async () => {
		const [logResult] = await executeTools(access(), [
			{ name: "read_nginx_logs", args: { log_type: "error", lines: 10000 } },
		]);
		expect(logResult.result.split("\n")).toHaveLength(100);

		const [auditResult] = await executeTools(access(), [{ name: "get_audit_log", args: { limit: 5 } }]);
		expect(JSON.parse(auditResult.result)).toHaveLength(5);
	});

	it("rejects unknown fields on account creation", async () => {
		const [result] = await executeTools(access(), [
			{
				name: "create_user",
				args: {
					name: "User",
					nickname: "User",
					email: "user@example.com",
					auth: { type: "password", secret: "secure-secret" },
					is_admin: true,
				},
			},
		]);
		expect(result.result).toContain("must NOT have additional properties");
		expect(mocks.createUser).not.toHaveBeenCalled();
	});

	it("rejects internal parameter aliases that the schema does not advertise", async () => {
		const [result] = await executeTools(access(), [{ name: "get_analytics_series", args: { proxy_host_id: 3 } }]);
		expect(result.result).toContain("must NOT have additional properties");
	});

	it("fails closed for privileged tools when the capability check fails", async () => {
		const denied = {
			can: vi.fn(async (permission) => {
				if (permission === "settings:update") throw new errs.PermissionError("No settings access");
				return true;
			}),
			token: { getUserId: () => 7 },
		};
		const [result] = await executeTools(denied, [{ name: "force_nginx_reload", args: {} }]);
		expect(result.result).toBe("Error: Tool not permitted: force_nginx_reload");
		expect(mocks.reloadNginx).not.toHaveBeenCalled();
	});
});
