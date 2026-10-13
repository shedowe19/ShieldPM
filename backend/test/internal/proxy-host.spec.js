import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../db.js", () => ({ default: () => ({}) }));
vi.mock("../../lib/config.js", () => ({ isSqlite: () => true, getEncryptionKey: () => "01".repeat(32) }));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: state.query } }));
vi.mock("../../internal/audit-log.js", () => ({ default: {} }));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/git-deploy.js", () => ({ default: {} }));
vi.mock("../../internal/gitops.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: {} }));
vi.mock("../../internal/proxy-host-monitor.js", () => ({ default: {} }));
vi.mock("../../internal/firewall-policy.js", () => ({
	assertHostFirewallGeoipAvailable: vi.fn(),
	validateHostFirewall: vi.fn(),
	withFirewallReferences: vi.fn(),
}));
vi.mock("../../internal/upload-relay.js", () => ({ validateRelayConfigForHost: vi.fn() }));

import service from "../../internal/proxy-host.js";

const access = {
	can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
	token: { getUserId: () => 7 },
};
const buildRow = () => ({
	id: 1,
	is_deleted: 0,
	domain_names: ["example.test"],
	forward_host: "/data/websites/host-1",
	git_credentials: "git-secret",
	terminal_password: "terminal-secret",
	terminal_private_key: "key-secret",
	certificate: {
		id: 42,
		nice_name: "example.test",
		meta: { letsencrypt_email: "private@example.test", dns_provider_credentials: "dns-secret" },
	},
});
const queryFor = (row) =>
	Object.assign(Promise.resolve(row), {
		where: vi.fn().mockReturnThis(),
		andWhere: vi.fn().mockReturnThis(),
		allowGraph: vi.fn().mockReturnThis(),
		withGraphFetched: vi.fn().mockReturnThis(),
		first: vi.fn().mockReturnThis(),
	});

describe("proxy-host get response redaction", () => {
	beforeEach(() => vi.clearAllMocks());

	it.each([undefined, ["domain_names"]])("redacts the actual service response with omit=%s", async (omit) => {
		const row = buildRow();
		state.query.mockReturnValue(queryFor(row));
		const result = await service.get(access, { id: 1, expand: ["certificate"], omit });
		expect(access.can).toHaveBeenCalledExactlyOnceWith("proxy_hosts:get", 1);
		expect(result).toMatchObject({
			id: 1,
			forward_host: "(managed)",
			certificate: { id: 42, nice_name: "example.test", meta: {} },
		});
		expect(result).not.toHaveProperty("is_deleted");
		for (const field of ["git_credentials", "terminal_password", "terminal_private_key"])
			expect(result).not.toHaveProperty(field);
		expect(JSON.stringify(result)).not.toMatch(
			/dns-secret|private@example\.test|git-secret|terminal-secret|key-secret/,
		);
		if (omit) expect(result).not.toHaveProperty("domain_names");
		else expect(result.domain_names).toEqual(["example.test"]);
	});

	it("cleans the certificate before applying custom omissions on the trusted managed-path read", async () => {
		state.query.mockReturnValue(queryFor(buildRow()));
		const result = await service.get(access, { id: 1, omit: ["domain_names"] }, { preserveManagedPath: true });
		expect(result.forward_host).toBe("/data/websites/host-1");
		expect(result.certificate.meta).toEqual({});
		expect(result).not.toHaveProperty("domain_names");
	});

	it("returns a null certificate safely and rejects a missing host", async () => {
		state.query.mockReturnValueOnce(queryFor({ id: 2, certificate: null }));
		expect(await service.get(access, { id: 2, omit: ["domain_names"] })).toMatchObject({
			id: 2,
			certificate: null,
		});
		state.query.mockReturnValueOnce(queryFor(undefined));
		await expect(service.get(access, { id: 99 })).rejects.toMatchObject({ name: "ItemNotFoundError", status: 404 });
	});
});
