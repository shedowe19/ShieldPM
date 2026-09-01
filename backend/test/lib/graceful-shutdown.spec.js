import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { installGracefulShutdown } from "../../lib/graceful-shutdown.js";

class FakeServer extends EventEmitter {
	listening = true;
	close(callback) {
		this.listening = false;
		callback();
	}
	closeIdleConnections() {}
}

describe("global graceful shutdown", () => {
	it("waits for startup, runs two idempotent producer sweeps and closes the DB last", async () => {
		const order = [];
		const exit = vi.fn();
		const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() };
		const coordinator = installGracefulShutdown({
			logger,
			exit,
			producerHooks: [
				{ name: "one", stop: async () => order.push("one") },
				{ name: "two", stop: async () => order.push("two") },
			],
			closeDatabase: async () => order.push("database"),
		});
		coordinator.setServer(new FakeServer());
		coordinator.setStartupPromise(Promise.resolve().then(() => order.push("startup")));

		const first = coordinator.shutdown("test");
		expect(coordinator.shutdown("again")).toBe(first);
		await first;
		coordinator.dispose();

		expect(order).toEqual(["startup", "one", "two", "one", "two", "database"]);
		expect(exit).toHaveBeenCalledWith(0);
	});

	it("uses allSettled semantics and reports a failing producer", async () => {
		const exit = vi.fn();
		const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() };
		const healthy = vi.fn();
		const coordinator = installGracefulShutdown({
			logger,
			exit,
			producerHooks: [
				{ name: "broken", stop: async () => Promise.reject(new Error("boom")) },
				{ name: "healthy", stop: healthy },
			],
			closeDatabase: vi.fn(),
		});
		await coordinator.shutdown("test");
		coordinator.dispose();
		expect(healthy).toHaveBeenCalledTimes(2);
		expect(exit).toHaveBeenCalledWith(1);
	});
});
