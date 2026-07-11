import { describe, expect, it, vi } from "vitest";

vi.mock("@/modals", () => {
	throw new Error("Tor Onion Services must not eagerly import the modal barrel");
});

vi.mock("@/components/Nginx/TorOnionModal", () => ({
	TorOnionModal: () => null,
}));

describe("TorOnionServices", () => {
	it("loads without eagerly importing the modal barrel", async () => {
		await expect(import("./TorOnionServices")).resolves.toHaveProperty("default");
	});
});
