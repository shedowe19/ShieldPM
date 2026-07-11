import { describe, expect, it, vi } from "vitest";

vi.mock("@/modals/lazy", () => {
	throw new Error("Tor Onion Services must not load the shared modal loader");
});

vi.mock("@/components/Nginx/TorOnionModal", () => ({
	TorOnionModal: () => null,
}));

describe("TorOnionServices", () => {
	it("loads without the shared modal loader", async () => {
		await expect(import("./TorOnionServices")).resolves.toHaveProperty("default");
	});
});
