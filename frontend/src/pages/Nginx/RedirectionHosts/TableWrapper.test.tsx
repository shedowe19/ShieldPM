import { describe, expect, it, vi } from "vitest";

vi.mock("src/modals/lazy", () => {
	throw new Error("Redirection Hosts table must not import the shared modal loader");
});

describe("Redirection Hosts TableWrapper", () => {
	it("loads without the shared modal loader", async () => {
		await expect(import("./TableWrapper")).resolves.toMatchObject({ default: expect.any(Function) });
	});
});
