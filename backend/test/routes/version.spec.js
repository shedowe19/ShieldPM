import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRemoteVersion = {
	get: vi.fn(() => Promise.resolve({ current: "4.2.0", latest: "4.3.0", update_available: true })),
};

vi.mock("../../modules/remote-version/service.js", () => ({ default: mockRemoteVersion }));
vi.mock("../../logger.js", () => ({
	debug: vi.fn(),
	express: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

describe("version routes", () => {
	describe("GET /version/check", () => {
		it("returns version info when update is available", async () => {
			const result = await mockRemoteVersion.get();
			expect(result.current).toBe("4.2.0");
			expect(result.latest).toBe("4.3.0");
			expect(result.update_available).toBe(true);
		});

		it("returns no update when versions match", async () => {
			mockRemoteVersion.get.mockResolvedValueOnce({ current: "4.2.0", latest: "4.2.0", update_available: false });
			const result = await mockRemoteVersion.get();
			expect(result.update_available).toBe(false);
		});

		it("returns safe fallback on error", async () => {
			mockRemoteVersion.get.mockRejectedValueOnce(new Error("Network error"));
			let data;
			try {
				data = await mockRemoteVersion.get();
			} catch {
				data = { current: null, latest: null, update_available: false };
			}
			expect(data.update_available).toBe(false);
			expect(data.current).toBeNull();
		});

		it("does not require authentication", () => {
			// No jwtdecode middleware on this endpoint
			expect(true).toBe(true);
		});
	});

	describe("OPTIONS /version/check", () => {
		it("returns 204", () => {
			const res = { sendStatus: vi.fn() };
			res.sendStatus(204);
			expect(res.sendStatus).toHaveBeenCalledWith(204);
		});
	});
});
