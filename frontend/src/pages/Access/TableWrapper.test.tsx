import { describe, expect, it, vi } from "vitest";

vi.mock("src/modals", () => {
	throw new Error("Access table must not eagerly import the modal barrel");
});

describe("Access TableWrapper", () => {
	it("loads without eagerly importing the modal barrel", async () => {
		await expect(import("./TableWrapper")).resolves.toHaveProperty("default");
	});
});
