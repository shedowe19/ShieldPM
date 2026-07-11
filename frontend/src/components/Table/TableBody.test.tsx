import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	create: vi.fn(),
	legacyFactory: vi.fn(),
}));

vi.mock("framer-motion", () => ({
	AnimatePresence: ({ children }: { children: unknown }) => children,
	motion: Object.assign(mocks.legacyFactory, { create: mocks.create }),
}));

describe("TableBody", () => {
	it("creates animated rows through the non-deprecated motion factory", async () => {
		await import("./TableBody");

		expect(mocks.create).toHaveBeenCalledOnce();
		expect(mocks.legacyFactory).not.toHaveBeenCalled();
	});
});
