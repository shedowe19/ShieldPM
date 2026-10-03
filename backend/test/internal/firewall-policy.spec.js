import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), assertExist: vi.fn(), lock: vi.fn() }));
vi.mock("../../internal/firewall-list.js", () => ({
	default: { get: mocks.get, assertExistForHost: mocks.assertExist },
}));
vi.mock("../../internal/nginx.js", () => ({ default: { withConfigurationLock: mocks.lock } }));

import { validateHostFirewall, withFirewallReferences } from "../../internal/firewall-policy.js";

describe("host firewall authorization and final reference check", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.get.mockResolvedValue({ id: 2 });
		mocks.assertExist.mockResolvedValue(undefined);
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
