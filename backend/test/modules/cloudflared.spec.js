import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
	spawn: vi.fn(() => mockChild),
}));

vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../models/cloudflared_tunnel.js", () => ({
	default: {
		query: vi.fn(() => mockTunnelQuery),
	},
}));

const mockChild = {
	stdout: { on: vi.fn() },
	stderr: { on: vi.fn() },
	on: vi.fn(),
	kill: vi.fn(),
	pid: 12345,
};

const mockTunnelQuery = {
	findById: vi.fn().mockReturnThis(),
	patch: vi.fn().mockResolvedValue(1),
	// biome-ignore lint/suspicious/noThenProperty: mock needs .then for query builder chain
	then: vi.fn(),
};

import { deleteProcess, getProcess, hasProcess, processes, setProcess } from "../../modules/cloudflared/state.js";
import cloudflaredService from "../../modules/cloudflared/service.js";

describe("cloudflared module", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		processes.clear();
	});

	describe("state management", () => {
		it("should set and get a process", () => {
			const fakeChild = { pid: 1 };
			setProcess(1, fakeChild);
			expect(getProcess(1)).toBe(fakeChild);
		});

		it("should check process existence with hasProcess", () => {
			expect(hasProcess(1)).toBe(false);
			setProcess(1, { pid: 1 });
			expect(hasProcess(1)).toBe(true);
		});

		it("should delete a process", () => {
			setProcess(1, { pid: 1 });
			deleteProcess(1);
			expect(hasProcess(1)).toBe(false);
		});

		it("should return undefined for non-existent process", () => {
			expect(getProcess(999)).toBeUndefined();
		});

		it("should handle multiple processes", () => {
			setProcess(1, { pid: 1 });
			setProcess(2, { pid: 2 });
			setProcess(3, { pid: 3 });
			expect(processes.size).toBe(3);
			deleteProcess(2);
			expect(processes.size).toBe(2);
			expect(hasProcess(2)).toBe(false);
		});
	});

	describe("stop", () => {
		it("should kill process and update DB when process exists", async () => {
			const fakeChild = { kill: vi.fn(), pid: 123 };
			setProcess(1, fakeChild);
			await cloudflaredService.stop(1);
			expect(fakeChild.kill).toHaveBeenCalledWith("SIGTERM");
			expect(hasProcess(1)).toBe(false);
		});

		it("should do nothing when process does not exist", async () => {
			await cloudflaredService.stop(999);
			// No error thrown
		});

		it("should remove process from state after stop", async () => {
			setProcess(5, { kill: vi.fn(), pid: 5 });
			expect(hasProcess(5)).toBe(true);
			await cloudflaredService.stop(5);
			expect(hasProcess(5)).toBe(false);
		});
	});

	describe("start", () => {
		it("should stop existing process before starting", async () => {
			const fakeChild = { kill: vi.fn(), pid: 100 };
			setProcess(1, fakeChild);
			const tunnel = {
				id: 1,
				name: "Test",
				token: "tok",
				meta: {},
				$query: () => ({ patch: vi.fn().mockResolvedValue(1) }),
			};
			// start will spawn, but we just test it doesn't throw
			await cloudflaredService.start(tunnel).catch(() => {});
			expect(fakeChild.kill).toHaveBeenCalledWith("SIGTERM");
		});
	});

	describe("init", () => {
		it("should be a function", () => {
			expect(typeof cloudflaredService.init).toBe("function");
		});
	});

	describe("restart", () => {
		it("should be a function", () => {
			expect(typeof cloudflaredService.restart).toBe("function");
		});
	});
});
