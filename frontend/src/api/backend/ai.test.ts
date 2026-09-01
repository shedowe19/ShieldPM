import { describe, expect, it, vi } from "vitest";
import { confirmAiAction } from "./ai";

const api = vi.hoisted(() => ({
	post: vi.fn(),
}));

vi.mock("./base", () => ({
	get: vi.fn(),
	post: api.post,
	put: vi.fn(),
}));

describe("AI backend API", () => {
	it("sends the opaque confirmation token using the validated API field", async () => {
		api.post.mockResolvedValue({ role: "assistant", content: "done" });

		await confirmAiAction("signed-confirmation");

		expect(api.post).toHaveBeenCalledWith({
			url: "/ai/confirm",
			data: { confirmation_token: "signed-confirmation" },
		});
	});
});
