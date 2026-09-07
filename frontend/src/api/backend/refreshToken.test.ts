import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./base", () => ({ post: vi.fn() }));

import { post } from "./base";
import { refreshToken } from "./refreshToken";

describe("refreshToken", () => {
	beforeEach(() => vi.clearAllMocks());

	it("shares one cookie rotation across overlapping callers", async () => {
		const response = { expires: "2026-09-07T12:15:00Z" };
		vi.mocked(post).mockResolvedValue(response);
		const first = refreshToken();
		const second = refreshToken();

		expect(first).toBe(second);
		await expect(first).resolves.toEqual(response);
		expect(post).toHaveBeenCalledOnce();
		expect(post).toHaveBeenCalledWith({ url: "/tokens/refresh", silentAuth: true });

		await refreshToken();
		expect(post).toHaveBeenCalledTimes(2);
	});

	it("allows another attempt after a failed refresh", async () => {
		vi.mocked(post).mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({ expires: 123 });
		await expect(refreshToken()).rejects.toThrow("Offline");
		await expect(refreshToken()).resolves.toEqual({ expires: 123 });
		expect(post).toHaveBeenCalledTimes(2);
	});
});
