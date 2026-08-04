import { describe, expect, it, vi } from "vitest";
import { withFirewallConfigLock } from "../../lib/firewall-config-lock.js";

describe("shared firewall configuration lock", () => {
	it("serializes snapshots and writes from different firewall policies", async () => {
		let active = 0;
		let maximum = 0;
		const render = async () => {
			active += 1;
			maximum = Math.max(maximum, active);
			await new Promise((resolve) => setTimeout(resolve, 5));
			active -= 1;
		};

		await Promise.all([
			withFirewallConfigLock(render),
			withFirewallConfigLock(render),
			withFirewallConfigLock(render),
		]);

		expect(maximum).toBe(1);
	});

	it("continues queued work after a failed render", async () => {
		const second = vi.fn(async () => "rendered");

		await expect(
			Promise.allSettled([
				withFirewallConfigLock(async () => {
					throw new Error("write failed");
				}),
				withFirewallConfigLock(second),
			]),
		).resolves.toHaveLength(2);

		expect(second).toHaveBeenCalledOnce();
	});
});
