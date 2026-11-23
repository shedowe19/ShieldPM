import { describe, expect, it } from "vitest";
import internalNginx from "../../internal/nginx.js";

describe("Nginx configuration lock", () => {
	it("fails a waiter after its acquire deadline instead of hanging forever", async () => {
		let release;
		const blocker = internalNginx.withConfigurationLock(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		await expect(internalNginx.withConfigurationLock(async () => "never", { timeoutMs: 25 })).rejects.toThrow(
			"Timed out after 25ms waiting for the configuration lock",
		);
		release();
		await blocker;
	});

	it("does not reject a callback that already acquired the lock", async () => {
		const result = await internalNginx.withConfigurationLock(
			async () => {
				await new Promise((resolve) => setTimeout(resolve, 40));
				return "committed";
			},
			{ timeoutMs: 10 },
		);
		expect(result).toBe("committed");
	});

	it("serializes operations and exposes only bounded lock diagnostics", async () => {
		const events = [];
		const first = internalNginx.withConfigurationLock(async () => {
			events.push("first:start");
			await new Promise((resolve) => setTimeout(resolve, 10));
			events.push("first:end");
			return 1;
		});
		const second = internalNginx.withConfigurationLock(async () => {
			events.push("second");
			return 2;
		});
		expect(await Promise.all([first, second])).toEqual([1, 2]);
		expect(events).toEqual(["first:start", "first:end", "second"]);
		expect(internalNginx.getConfigurationLockState()).toEqual({
			busy: false,
			active_for_ms: 0,
			label: "",
		});
	});
});
