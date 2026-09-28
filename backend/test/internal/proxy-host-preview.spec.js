import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/host.js", () => ({
	default: {
		validateReferences: vi.fn().mockResolvedValue(),
		validateDomainNames: vi.fn((names) => names),
		isHostnameTaken: vi.fn().mockResolvedValue({ is_taken: false }),
		cleanSslHstsData: vi.fn((_newCert, candidate) => candidate),
	},
}));
vi.mock("../../internal/proxy-host.js", () => ({ default: { get: vi.fn() } }));
vi.mock("../../internal/nginx.js", () => ({
	default: {
		getConfigName: vi.fn((_type, id) => `/data/nginx/proxy_host/${id}.conf`),
		withConfigurationLock: vi.fn((callback) => callback()),
		renderConfig: vi.fn().mockResolvedValue('server_name proposed.test;\nclient_secret = "NEW-SECRET";\n'),
	},
}));
vi.mock("../../models/access_list.js", () => ({ default: { query: vi.fn() } }));
vi.mock("../../models/certificate.js", () => ({ default: { query: vi.fn() } }));
vi.mock("../../internal/upload-relay.js", () => ({ validateRelayConfigForHost: vi.fn() }));

import internalHost from "../../internal/host.js";
import internalNginx from "../../internal/nginx.js";
import internalProxyHost from "../../internal/proxy-host.js";
import preview from "../../internal/proxy-host-preview.js";

const payload = {
	domain_names: ["proposed.test"],
	forward_scheme: "http",
	forward_host: "127.0.0.1",
	forward_port: 8080,
};
const access = { can: vi.fn().mockResolvedValue({}), token: { getUserId: () => 2 } };

describe("Proxy host configuration preview", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		access.can.mockResolvedValue({});
		internalHost.isHostnameTaken.mockResolvedValue({ is_taken: false });
		internalNginx.renderConfig.mockResolvedValue('server_name proposed.test;\nclient_secret = "NEW-SECRET";\n');
	});
	afterEach(() => vi.restoreAllMocks());

	it("renders an unsaved host using the production renderer without touching Nginx or the database", async () => {
		const writeFile = vi.spyOn(fs.promises, "writeFile");
		const open = vi.spyOn(fs.promises, "open");
		const result = await preview.preview(access, payload);
		expect(access.can).toHaveBeenCalledWith("proxy_hosts:create", payload);
		expect(internalNginx.renderConfig).toHaveBeenCalledWith("proxy_host", expect.objectContaining({ id: 0 }), {
			preview: true,
		});
		expect(result.config).not.toContain("NEW-SECRET");
		expect(result.diff).toContain("+server_name proposed.test;");
		expect(result).toMatchObject({
			hasCurrent: false,
			nginxValidated: false,
			limitations: ["render-only", "id-pending"],
		});
		expect(internalProxyHost.get).not.toHaveBeenCalled();
		expect(open).not.toHaveBeenCalled();
		expect(writeFile).not.toHaveBeenCalled();
	});

	it("checks host ownership before reading only its active config, and redacts secrets on both sides", async () => {
		internalProxyHost.get.mockResolvedValue({
			...payload,
			id: 15,
			domain_names: ["old.test"],
			access_list_id: 9,
			access_list: { meta: { auth_type: "oidc", oidc_client_secret: "OLD-SECRET" } },
		});
		const close = vi.fn().mockResolvedValue();
		const open = vi.spyOn(fs.promises, "open").mockResolvedValue({
			stat: vi.fn().mockResolvedValue({ isFile: () => true, size: 200 }),
			readFile: vi.fn().mockResolvedValue('server_name old.test;\nclient_secret = "OLD-SECRET";\n'),
			close,
		});
		const result = await preview.preview(access, payload, 15);
		expect(access.can).toHaveBeenCalledWith("proxy_hosts:update", 15);
		expect(internalProxyHost.get).toHaveBeenCalledWith(access, expect.objectContaining({ id: 15 }), {
			preserveManagedPath: true,
		});
		expect(open).toHaveBeenCalledWith(
			"/data/nginx/proxy_host/15.conf",
			fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
		);
		expect(close).toHaveBeenCalledOnce();
		expect(result.diff).toContain("-server_name old.test;");
		expect(result.diff).toContain("+server_name proposed.test;");
		expect(JSON.stringify(result)).not.toMatch(/(?:OLD|NEW)-SECRET/);
		expect(result.hasCurrent).toBe(true);
	});

	it("rejects unauthorized IDs and conflicting domains before touching a live config", async () => {
		const open = vi.spyOn(fs.promises, "open");
		access.can.mockRejectedValueOnce(new Error("Permission Denied"));
		await expect(preview.preview(access, payload, 27)).rejects.toThrow("Permission Denied");
		expect(open).not.toHaveBeenCalled();
		internalHost.isHostnameTaken.mockResolvedValueOnce({ is_taken: true, hostname: "proposed.test" });
		await expect(preview.preview(access, payload)).rejects.toThrow("proposed.test is already in use");
		expect(internalNginx.renderConfig).not.toHaveBeenCalled();
		await expect(preview.preview(access, payload, "../../other")).rejects.toThrow("Invalid proxy host ID");
	});

	it("never follows a symlink to another file", async () => {
		internalProxyHost.get.mockResolvedValue({ ...payload, id: 15 });
		vi.spyOn(fs.promises, "open").mockRejectedValue(Object.assign(new Error("symlink"), { code: "ELOOP" }));
		await expect(preview.preview(access, payload, 15)).rejects.toThrow(
			"Unable to read the active proxy host configuration",
		);
	});

	it("reports pending certificate issuance without claiming that a TLS config was validated", async () => {
		const result = await preview.preview(access, { ...payload, certificate_id: "new", ssl_forced: true });
		expect(result.limitations).toContain("certificate-pending");
		expect(internalNginx.renderConfig).toHaveBeenCalledWith(
			"proxy_host",
			expect.objectContaining({ certificate_id: 0, ssl_forced: false }),
			{ preview: true },
		);
	});
});
