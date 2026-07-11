import { describe, expect, it, vi } from "vitest";

vi.mock("src/modals/lazy", () => {
	throw new Error("Proxy Hosts table must not import the shared modal loader");
});

describe("Proxy Hosts TableWrapper", () => {
	it("loads without importing the shared modal loader", async () => {
		await expect(import("./TableWrapper")).resolves.toHaveProperty("default");
	});
});
