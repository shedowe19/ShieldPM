import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	addAuditLog: vi.fn(),
	cloudflaredQuery: vi.fn(),
	create: vi.fn(),
	createTorService: vi.fn(),
	getProxyHost: vi.fn(),
	updateProxyHost: vi.fn(),
	configure: vi.fn(),
	reload: vi.fn(),
	processMaintenance: vi.fn(),
	login: vi.fn(),
	password: vi.fn(),
	restartCloudTunnel: vi.fn(),
	restartTorService: vi.fn(),
	startCloudTunnel: vi.fn(),
	startTorService: vi.fn(),
	stopCloudTunnel: vi.fn(),
	stopTorService: vi.fn(),
	torOnionQuery: vi.fn(),
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: mocks.addAuditLog } }));
vi.mock("../../internal/cloudflared.js", () => ({
	default: {
		restart: mocks.restartCloudTunnel,
		start: mocks.startCloudTunnel,
		stop: mocks.stopCloudTunnel,
	},
}));
vi.mock("../../internal/tor.js", () => ({
	default: {
		create: mocks.createTorService,
		restart: mocks.restartTorService,
		start: mocks.startTorService,
		stop: mocks.stopTorService,
	},
}));
vi.mock("../../lib/config.js", () => ({
	getEncryptionKey: vi.fn().mockReturnValue("0".repeat(64)),
	isDemoMode: vi.fn().mockReturnValue(false),
}));
vi.mock("../../models/cloudflared_tunnel.js", () => ({ default: { query: mocks.cloudflaredQuery } }));
vi.mock("../../models/tor_onion.js", () => ({ default: { query: mocks.torOnionQuery } }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../internal/access-list.js", () => ({ default: {} }));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/ddns-provider.js", () => ({ default: {} }));
vi.mock("../../internal/dead-host.js", () => ({ default: {} }));
vi.mock("../../internal/ip_ranges.js", () => ({ default: {} }));
vi.mock("../../internal/maintenance.js", () => ({ default: { processMaintenance: mocks.processMaintenance } }));
vi.mock("../../internal/nginx.js", () => ({ default: { configure: mocks.configure, reload: mocks.reload } }));
vi.mock("../../internal/pki.js", () => ({ default: {} }));
vi.mock("../../internal/proxy-host.js", () => ({
	default: { get: mocks.getProxyHost, update: mocks.updateProxyHost },
}));
vi.mock("../../internal/redirection-host.js", () => ({ default: {} }));
vi.mock("../../internal/report.js", () => ({ default: {} }));
vi.mock("../../internal/setting.js", () => ({ default: {} }));
vi.mock("../../internal/stream.js", () => ({ default: {} }));
vi.mock("../../internal/token.js", () => ({ default: {} }));
vi.mock("../../internal/user.js", () => ({
	default: { create: mocks.create, setPassword: mocks.password, loginAs: mocks.login },
}));

import { executeTools } from "../../internal/ai/executor.js";

const access = { can: vi.fn().mockResolvedValue(true) };
describe("AI account tool argument contracts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.processMaintenance.mockResolvedValue();
		mocks.create.mockResolvedValue({ id: 5, email: "user@example.com" });
	});
	it("passes advertised auth.secret to the password auth backend", async () => {
		const [result] = await executeTools(access, [
			{
				name: "create_user",
				args: { name: "User", email: "user@example.com", auth: { type: "password", secret: "secure-secret" } },
			},
		]);
		expect(result.result).toContain("Created User");
		expect(mocks.create).toHaveBeenCalledWith(
			access,
			expect.objectContaining({ auth: { type: "password", secret: "secure-secret" } }),
		);
	});
	it("uses password auth for the legacy flat password input too", async () => {
		await executeTools(access, [{ name: "create_user", args: { name: "User", password: "secure-secret" } }]);
		expect(mocks.create).toHaveBeenCalledWith(
			access,
			expect.objectContaining({ auth: { type: "password", secret: "secure-secret" } }),
		);
	});
	it("flattens advertised password update arguments and keeps current-password verification", async () => {
		await executeTools(access, [
			{
				name: "update_user_password",
				args: { id: 5, auth: { type: "password", secret: "new-secret" }, current: "old-secret" },
			},
		]);
		expect(mocks.password).toHaveBeenCalledWith(access, {
			id: 5,
			type: "password",
			secret: "new-secret",
			current: "old-secret",
		});
	});
	it("does not mint an impersonation token when browser login cannot be completed", async () => {
		const [result] = await executeTools(access, [{ name: "login_as_user", args: { id: 5 } }]);
		expect(mocks.login).not.toHaveBeenCalled();
		expect(result.result).toContain("Users page");
	});
	it("lets proxy-host update configure maintenance without rendering a sanitized public host again", async () => {
		const [result] = await executeTools(access, [{ name: "set_maintenance_mode", args: { id: 5, active: true } }]);
		expect(result.error).toBeUndefined();
		expect(mocks.updateProxyHost).toHaveBeenCalledWith(access, { id: 5, maintenance_active: true });
		expect(mocks.getProxyHost).not.toHaveBeenCalled();
		expect(mocks.configure).not.toHaveBeenCalled();
		expect(mocks.reload).not.toHaveBeenCalled();
	});
});
