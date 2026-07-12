import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	create: vi.fn(),
	mFactory: vi.fn(),
}));

vi.mock("framer-motion", () => ({
	AnimatePresence: ({ children }: { children: unknown }) => children,
	domAnimation: {},
	LazyMotion: ({ children }: { children: unknown }) => children,
	m: Object.assign(mocks.mFactory, { create: mocks.create }),
}));

describe("TableBody", () => {
	it("creates animated rows through the feature-scoped motion factory", async () => {
		await import("./TableBody");

		expect(mocks.create).toHaveBeenCalledOnce();
		expect(mocks.mFactory).not.toHaveBeenCalled();
	});
});
