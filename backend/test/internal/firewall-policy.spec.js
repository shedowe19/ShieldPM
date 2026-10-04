import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	get: vi.fn(),
	assertExist: vi.fn(),
	lock: vi.fn(),
	geoip: vi.fn(),
	asn: vi.fn(),
	status: vi.fn(),
}));
vi.mock("../../internal/firewall-list.js", () => ({
	default: { get: mocks.get, assertExistForHost: mocks.assertExist },
}));
vi.mock("../../internal/nginx.js", () => ({ default: { withConfigurationLock: mocks.lock } }));
vi.mock("../../lib/firewall-geoip.js", () => ({
	assertCountryFirewallAvailable: mocks.geoip,
	assertAsnFirewallAvailable: mocks.asn,
	getFirewallGeoipStatus: mocks.status,
}));

import { validateHostFirewall, withFirewallReferences } from "../../internal/firewall-policy.js";

describe("host firewall authorization and final reference check", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.get.mockResolvedValue({ id: 2 });
		mocks.assertExist.mockResolvedValue(undefined);
		mocks.geoip.mockResolvedValue(undefined);
		mocks.asn.mockResolvedValue(undefined);
		mocks.status.mockResolvedValue({ available: true, asn: { available: true } });
		mocks.lock.mockImplementation((work) => work());
	});
	it("authorizes only newly assigned lists and preserves unrelated host metadata", async () => {
		const access = {};
		const data = { meta: { custom: true, ip_firewall: { list_ids: [1, 2] } } };
		await validateHostFirewall(access, data, { meta: { ip_firewall: { list_ids: [1] } } });
		expect(mocks.get).toHaveBeenCalledExactlyOnceWith(access, { id: 2 });
		expect(data.meta.custom).toBe(true);
		expect(data.meta.ip_firewall).toMatchObject({ enabled: false });
	});
	it("rejects references deleted after the earlier permission check before database mutation", async () => {
		const write = vi.fn();
		const data = { meta: { ip_firewall: { enabled: false, list_ids: [2] } } };
		await validateHostFirewall({}, data);
		mocks.assertExist.mockRejectedValueOnce(new Error("Firewall list 2 no longer exists"));
		await expect(withFirewallReferences(data, {}, write)).rejects.toThrow("no longer exists");
		expect(mocks.lock).toHaveBeenCalledOnce();
		expect(write).not.toHaveBeenCalled();
	});
	it("retains the enabled firewall when an unrelated partial host edit omits it", async () => {
		const data = { meta: { nginx_online: true } };
		await validateHostFirewall({}, data, {
			meta: JSON.stringify({ custom: "retained", ip_firewall: { enabled: true, list_ids: [2] } }),
		});
		expect(data.meta).toMatchObject({
			custom: "retained",
			nginx_online: true,
			ip_firewall: { enabled: true, list_ids: [2] },
		});
		expect(mocks.get).not.toHaveBeenCalled();
	});
	it("preserves country blocking through unrelated partial edits without list authorization calls", async () => {
		const data = { meta: { nginx_online: true } };
		await validateHostFirewall({}, data, {
			meta: JSON.stringify({
				ip_firewall: {
					enabled: true,
					country_denylist: ["DE", "XK"],
					country_reason: "Regional restriction",
					block_unknown_country: true,
				},
			}),
		});
		expect(data.meta.ip_firewall).toMatchObject({
			country_denylist: ["DE", "XK"],
			country_reason: "Regional restriction",
			block_unknown_country: true,
		});
		expect(mocks.get).not.toHaveBeenCalled();
	});
	it.each([{ country_denylist: ["DE"] }, { block_unknown_country: true }])(
		"rejects country activation before any list checks or host write when GeoIP is unavailable: %j",
		async (rule) => {
			const data = { meta: { ip_firewall: { enabled: true, list_ids: [2], ...rule } } };
			const write = vi.fn();
			mocks.geoip.mockRejectedValueOnce(new Error("Country firewall requires supported GeoIP configuration"));
			await expect(
				(async () => {
					await validateHostFirewall({}, data);
					await withFirewallReferences(data, {}, write);
				})(),
			).rejects.toThrow(/supported GeoIP/);
			expect(mocks.get).not.toHaveBeenCalled();
			expect(mocks.lock).not.toHaveBeenCalled();
			expect(write).not.toHaveBeenCalled();
		},
	);
	it("keeps disabled country rules editable while GeoIP is unavailable", async () => {
		mocks.geoip.mockImplementationOnce(async (policy) => {
			if (policy.enabled) throw new Error("Country firewall requires supported GeoIP configuration");
		});
		const data = {
			meta: { ip_firewall: { enabled: false, country_denylist: ["DE", "XK"], block_unknown_country: true } },
		};
		const write = vi.fn().mockResolvedValue("saved");
		await validateHostFirewall({}, data);
		await expect(withFirewallReferences(data, {}, write)).resolves.toBe("saved");
		expect(data.meta.ip_firewall).toMatchObject({
			enabled: false,
			country_denylist: ["DE", "XK"],
			block_unknown_country: true,
		});
		expect(write).toHaveBeenCalledOnce();
	});
	it("preserves ASN rules and their reasons through unrelated partial metadata edits", async () => {
		const data = { meta: { nginx_online: true } };
		await validateHostFirewall({}, data, {
			meta: JSON.stringify({
				ip_firewall: { enabled: true, list_ids: [2], asn_denylist: [{ asn: 13335, reason: "Network policy" }] },
			}),
		});
		expect(data.meta.ip_firewall.asn_denylist).toEqual([{ asn: 13335, reason: "Network policy" }]);
		expect(mocks.asn).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ enabled: true, asn_denylist: [{ asn: 13335, reason: "Network policy" }] }),
		);
		expect(mocks.get).not.toHaveBeenCalled();
	});
	it("rejects ASN activation before list authorization, configuration locks or database writes", async () => {
		const data = { meta: { ip_firewall: { enabled: true, list_ids: [2], asn_denylist: [{ asn: 13335 }] } } };
		const write = vi.fn();
		mocks.asn.mockRejectedValueOnce(new Error("ASN firewall requires supported GeoIP ASN configuration"));
		await expect(
			(async () => {
				await validateHostFirewall({}, data);
				await withFirewallReferences(data, {}, write);
			})(),
		).rejects.toThrow(/supported GeoIP ASN/);
		expect(mocks.get).not.toHaveBeenCalled();
		expect(mocks.lock).not.toHaveBeenCalled();
		expect(write).not.toHaveBeenCalled();
	});
	it("allows disabled ASN rules to be saved while ASN support is unavailable", async () => {
		mocks.asn.mockImplementationOnce(async (policy) => {
			if (policy.enabled) throw new Error("ASN firewall requires supported GeoIP ASN configuration");
		});
		const data = {
			meta: { ip_firewall: { enabled: false, asn_denylist: [{ asn: 4294967295, reason: " Retained " }] } },
		};
		const write = vi.fn().mockResolvedValue("saved");
		await validateHostFirewall({}, data);
		await expect(withFirewallReferences(data, {}, write)).resolves.toBe("saved");
		expect(data.meta.ip_firewall.asn_denylist).toEqual([{ asn: 4294967295, reason: "Retained" }]);
		expect(write).toHaveBeenCalledOnce();
	});
	it("shares one configuration inspection between active country and ASN prerequisites", async () => {
		const data = {
			meta: { ip_firewall: { enabled: true, country_denylist: ["DE"], asn_denylist: [{ asn: 13335 }] } },
		};
		await validateHostFirewall({}, data);
		expect(mocks.status).toHaveBeenCalledOnce();
		const sharedStatus = await mocks.status.mock.results[0].value;
		expect(mocks.geoip).toHaveBeenCalledExactlyOnceWith(data.meta.ip_firewall, sharedStatus);
		expect(mocks.asn).toHaveBeenCalledExactlyOnceWith(data.meta.ip_firewall, sharedStatus);
	});
	it("holds the configuration lock through the final database write, including existing disabled policies", async () => {
		let locked = false;
		mocks.lock.mockImplementation(async (work) => {
			locked = true;
			try {
				return await work();
			} finally {
				locked = false;
			}
		});
		const write = vi.fn(async () => {
			expect(locked).toBe(true);
			return "saved";
		});
		await expect(
			withFirewallReferences(
				{},
				{ meta: JSON.stringify({ ip_firewall: { enabled: false, list_ids: [2] } }) },
				write,
			),
		).resolves.toBe("saved");
		expect(mocks.assertExist).toHaveBeenCalledExactlyOnceWith([2]);
		expect(locked).toBe(false);
	});
});
