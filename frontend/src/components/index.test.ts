import { describe, expect, it, vi } from "vitest";

vi.mock("src/modals/lazy", () => {
	throw new Error("The shared component barrel must not eagerly import modal loaders");
});

describe("component barrel", () => {
	it("loads without eagerly importing modal loaders", async () => {
		await expect(import("./index")).resolves.toHaveProperty("SiteHeader");
	});
});
