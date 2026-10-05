import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	patch: vi.fn(),
	query: vi.fn(),
	configure: vi.fn(),
	readFile: vi.fn(),
	stat: vi.fn(),
	list: vi.fn(),
	audit: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ default: { readFile: mocks.readFile, stat: mocks.stat } }));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/access-list.js", () => ({ default: {} }));
vi.mock("../../internal/firewall-list.js", () => ({ default: { get: mocks.list } }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: mocks.audit } }));
vi.mock("../../internal/nginx.js", () => ({ default: { configure: mocks.configure } }));
vi.mock("../../internal/git-deploy.js", () => ({ default: {} }));
vi.mock("../../internal/gitops.js", () => ({ default: {} }));
vi.mock("../../internal/host.js", () => ({ default: {} }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: {} }));
vi.mock("../../internal/proxy-host-monitor.js", () => ({ default: {} }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: vi.fn() }));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: mocks.query } }));
vi.mock("../../models/access_list.js", () => ({ default: {} }));

import proxy from "../../internal/proxy-host.js";

const access = { can: vi.fn().mockResolvedValue(true) };

describe("proxy host enable country and ASN firewall readiness", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.readFile.mockRejectedValue(
			Object.assign(new Error("GeoIP configuration is unavailable"), { code: "ENOENT" }),
		);
		mocks.patch.mockResolvedValue(1);
		mocks.stat.mockResolvedValue({ isFile: () => false, size: 0 });
		mocks.query.mockReturnValue({ where: () => ({ patch: mocks.patch }) });
		mocks.configure.mockResolvedValue({ nginx_online: true });
		mocks.list.mockRejectedValue(new Error("Retained list is not visible"));
	});
	afterEach(() => vi.restoreAllMocks());

	it.each([
		{ enabled: true, country_denylist: ["DE"] },
		{ enabled: true, block_unknown_country: true },
	])("rejects unsupported saved country rules before changing the disabled host: %j", async (policy) => {
		const row = { id: 7, enabled: 0, meta: { ip_firewall: policy } };
		vi.spyOn(proxy, "get").mockResolvedValue(row);

		await expect(proxy.enable(access, { id: 7 })).rejects.toThrow(/Country filtering requires.*GeoIP/);

		expect(row.enabled).toBe(0);
		expect(mocks.query).not.toHaveBeenCalled();
		expect(mocks.patch).not.toHaveBeenCalled();
		expect(mocks.configure).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});
	it.each([
		undefined,
		{ enabled: true, list_ids: [99], country_denylist: [], block_unknown_country: false },
		{ enabled: false, list_ids: [99], country_denylist: ["DE"], block_unknown_country: true },
		{ enabled: false, list_ids: [99], asn_denylist: [{ asn: 13335, reason: "Saved rule" }] },
	])("enables hosts without active country rules while retaining existing list assignments: %j", async (policy) => {
		const row = { id: 7, enabled: 0, access_list_id: 0, meta: { ip_firewall: policy } };
		vi.spyOn(proxy, "get").mockResolvedValue(row);

		await expect(proxy.enable(access, { id: 7 })).resolves.toBe(true);

		expect(row.enabled).toBe(1);
		expect(mocks.patch).toHaveBeenCalledExactlyOnceWith({ enabled: 1 });
		expect(mocks.configure).toHaveBeenCalledWith(expect.any(Object), "proxy_host", row);
		expect(mocks.readFile).not.toHaveBeenCalled();
		expect(mocks.list).not.toHaveBeenCalled();
		expect(row.meta.ip_firewall).toEqual(policy);
	});
	it("rejects unsupported saved ASN rules before changing the disabled host", async () => {
		const row = {
			id: 7,
			enabled: 0,
			meta: { ip_firewall: { enabled: true, asn_denylist: [{ asn: 13335, reason: "Network policy" }] } },
		};
		vi.spyOn(proxy, "get").mockResolvedValue(row);
		await expect(proxy.enable(access, { id: 7 })).rejects.toThrow(/ASN filtering requires.*GeoIP/);
		expect(row.enabled).toBe(0);
		expect(mocks.query).not.toHaveBeenCalled();
		expect(mocks.patch).not.toHaveBeenCalled();
		expect(mocks.configure).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});
	it.each([false, true])(
		"checks ASN support independently and shares the inspection when country rules are also active: %s",
		async (countryEnabled) => {
			const asnDatabase = "/private/asn.mmdb";
			const countryDatabase = "/private/country.mmdb";
			mocks.stat.mockImplementation(async (filename) => ({
				isFile: () => [asnDatabase, countryDatabase].includes(filename),
				size: 100,
			}));
			mocks.readFile.mockResolvedValue(`http {
				geoip2 ${asnDatabase} {
					$spm_geoip2_asn default=0 source=$remote_addr autonomous_system_number;
					$spm_geoip2_asn_org source=$remote_addr autonomous_system_organization;
				}
				${countryEnabled ? `geoip2 ${countryDatabase} { $geoip2_country_code source=$remote_addr country iso_code; }` : ""}
			}`);
			const policy = {
				enabled: true,
				list_ids: [99],
				asn_denylist: [{ asn: 13335, reason: "Network policy" }],
				country_denylist: countryEnabled ? ["DE"] : [],
			};
			const row = { id: 7, enabled: 0, access_list_id: 0, meta: { ip_firewall: policy } };
			vi.spyOn(proxy, "get").mockResolvedValue(row);
			await expect(proxy.enable(access, { id: 7 })).resolves.toBe(true);
			expect(mocks.readFile).toHaveBeenCalledExactlyOnceWith("/usr/local/nginx/conf/nginx.conf", "utf8");
			expect(mocks.patch).toHaveBeenCalledExactlyOnceWith({ enabled: 1 });
			expect(mocks.list).not.toHaveBeenCalled();
			expect(row.meta.ip_firewall).toEqual(policy);
		},
	);
});
