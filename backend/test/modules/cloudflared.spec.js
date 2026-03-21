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
	then: vi.fn(),
};

import { deleteProcess, getProcess, hasProcess, processes, setProcess } from "../../modules/cloudflared/state.js";

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
});
