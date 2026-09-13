import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./base", () => ({ post: vi.fn() }));

import AuthStore from "src/modules/AuthStore";
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

	it("does not share an old rotation with a new session or clear its pending request", async () => {
		let finishOld!: (response: { expires: number }) => void;
		let finishNew!: (response: { expires: number }) => void;
		vi.mocked(post)
			.mockReturnValueOnce(
				new Promise((resolve) => {
					finishOld = resolve;
				}),
			)
			.mockReturnValueOnce(
				new Promise((resolve) => {
					finishNew = resolve;
				}),
			);
		const oldRequest = refreshToken();
		AuthStore.set({ expires: Date.now() + 900_000, user: { id: 3 } });
		const newRequest = refreshToken();
		const wasShared = oldRequest === newRequest;
		finishOld({ expires: 123 });
		await oldRequest;
		const overlap = refreshToken();
		// Resolve every request before asserting so a failed baseline cannot leak a pending promise.
		finishNew({ expires: 456 });
		await Promise.all([newRequest, overlap]);
		expect(wasShared).toBe(false);
		expect(overlap).toBe(newRequest);
		expect(post).toHaveBeenCalledTimes(2);
		AuthStore.clear();
	});
});
