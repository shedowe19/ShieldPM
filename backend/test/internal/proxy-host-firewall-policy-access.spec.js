import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findById: vi.fn(),
	proxyHostFindById: vi.fn(),
	withPolicyLocks: vi.fn(async (_ids, operation) => await operation()),
}));

vi.mock("../../internal/audit-log.js", () => ({ default: {} }));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/firewall-policy.js", () => ({ withPolicyLocks: mocks.withPolicyLocks }));
vi.mock("../../internal/git-deploy.js", () => ({ default: {} }));
vi.mock("../../internal/gitops.js", () => ({ default: {} }));
vi.mock("../../internal/host.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: {} }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: vi.fn() }));
vi.mock("../../lib/error.js", () => ({ default: {} }));
vi.mock("../../lib/utils.js", () => ({ default: {} }));
vi.mock("../../models/access_list.js", () => ({ default: {} }));
vi.mock("../../models/firewall_policy.js", () => ({
	default: {
		query: () => ({ findById: mocks.findById }),
	},
}));
vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: () => ({ findById: mocks.proxyHostFindById }),
	},
}));

import {
	proxyHostAllowedGraph,
	requestsFirewallPolicy,
	validateFirewallPolicyAssignment,
	withCurrentFirewallPolicyLock,
	withFirewallPolicyAssignmentLock,
} from "../../internal/proxy-host.js";

describe("proxy host firewall policy permissions", () => {
	it("allows ordinary users to submit null or unchanged policy values without settings access", async () => {
		const access = { can: vi.fn() };

		expect(await validateFirewallPolicyAssignment(access, null)).toBeNull();
		expect(await validateFirewallPolicyAssignment(access, "7", 7)).toBe(7);
		expect(access.can).not.toHaveBeenCalled();
	});

	it("requires settings access and verifies a policy only when the assignment changes", async () => {
		const access = { can: vi.fn().mockResolvedValue(true) };
		mocks.findById.mockResolvedValue({ id: 9 });

		expect(await validateFirewallPolicyAssignment(access, 9, null)).toBe(9);
		expect(access.can).toHaveBeenCalledWith("settings:update", "firewall-policies");
		expect(mocks.findById).toHaveBeenCalledWith(9);
	});

	it("serializes a host's current and requested policy against policy deletion", async () => {
		const operation = vi.fn().mockResolvedValue("updated");

		expect(await withFirewallPolicyAssignmentLock(7, 9, operation)).toBe("updated");
		expect(mocks.withPolicyLocks).toHaveBeenLastCalledWith([7, 9], operation);
	});

	it("rechecks the current assignment before deleting a host", async () => {
		const operation = vi.fn().mockResolvedValue("deleted");
		mocks.withPolicyLocks.mockClear();
		mocks.proxyHostFindById.mockReset();
		mocks.proxyHostFindById
			.mockResolvedValueOnce({ firewall_policy_id: 7, id: 41, is_deleted: 0 })
			.mockResolvedValueOnce({ firewall_policy_id: 9, id: 41, is_deleted: 0 })
			.mockResolvedValueOnce({ firewall_policy_id: 9, id: 41, is_deleted: 0 })
			.mockResolvedValueOnce({ firewall_policy_id: 9, id: 41, is_deleted: 0 });

		expect(await withCurrentFirewallPolicyLock(41, operation)).toBe("deleted");
		expect(mocks.withPolicyLocks).toHaveBeenNthCalledWith(1, [7], expect.any(Function));
		expect(mocks.withPolicyLocks).toHaveBeenNthCalledWith(2, [9], expect.any(Function));
		expect(operation).toHaveBeenCalledWith(expect.objectContaining({ firewall_policy_id: 9 }));
	});

	it("parses every policy expansion form before applying the dedicated permission gate", () => {
		expect(requestsFirewallPolicy(["certificate", "firewall_policy"])).toBe(true);
		expect(requestsFirewallPolicy(["firewall_policy.feed_status"])).toBe(true);
		expect(requestsFirewallPolicy(["firewall_policy as policy"])).toBe(true);
		expect(requestsFirewallPolicy(["firewall_policy()"])).toBe(true);
		expect(requestsFirewallPolicy(["certificate", "access_list"])).toBe(false);
		expect(proxyHostAllowedGraph(["certificate"])).not.toContain("firewall_policy");
		expect(proxyHostAllowedGraph(["firewall_policy as policy"])).toContain("firewall_policy");
	});
});
