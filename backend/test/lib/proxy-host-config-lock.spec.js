import { describe, expect, it } from "vitest";
import { withProxyHostConfigLock } from "../../lib/proxy-host-config-lock.js";

describe("proxy-host configuration lock", () => {
	it("serializes concurrent operations for the same proxy host", async () => {
		let active = 0;
		let maximum = 0;
		const operation = async () => {
			active += 1;
			maximum = Math.max(maximum, active);
			await new Promise((resolve) => setTimeout(resolve, 5));
			active -= 1;
		};

		await Promise.all([
			withProxyHostConfigLock(41, operation),
			withProxyHostConfigLock(41, operation),
			withProxyHostConfigLock(41, operation),
		]);

		expect(maximum).toBe(1);
	});

	it("does not serialize different proxy hosts", async () => {
		let active = 0;
		let maximum = 0;
		const operation = async () => {
			active += 1;
			maximum = Math.max(maximum, active);
			await new Promise((resolve) => setTimeout(resolve, 5));
			active -= 1;
		};

		await Promise.all([withProxyHostConfigLock(41, operation), withProxyHostConfigLock(42, operation)]);

		expect(maximum).toBe(2);
	});
});
