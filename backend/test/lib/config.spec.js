import { describe, expect, it, vi } from "vitest";

vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), error: vi.fn() },
}));

// We test the exported functions by importing the module fresh with controlled env
describe("config", () => {
	describe("isDestructiveTestMode", () => {
		it("returns true when both CI and destructive env vars are set", async () => {
			vi.stubEnv("CI", "true");
			vi.stubEnv("NPM_CI_ENABLE_DESTRUCTIVE_TEST_MODE", "true");
			// Dynamic import to get fresh module would be ideal, but we can test the logic
			const mod = await import("../../lib/config.js");
			expect(mod.isDestructiveTestMode()).toBe(true);
			vi.unstubAllEnvs();
		});

		it("returns false when CI is not true", async () => {
			vi.stubEnv("CI", "false");
			vi.stubEnv("NPM_CI_ENABLE_DESTRUCTIVE_TEST_MODE", "true");
			const mod = await import("../../lib/config.js");
			expect(mod.isDestructiveTestMode()).toBe(false);
			vi.unstubAllEnvs();
		});
	});

	describe("isDemoMode", () => {
		it("returns true when DEMO_MODE is true", async () => {
			vi.stubEnv("DEMO_MODE", "true");
			const mod = await import("../../lib/config.js");
			expect(mod.isDemoMode()).toBe(true);
			vi.unstubAllEnvs();
		});

		it("returns false when DEMO_MODE is not set", async () => {
			vi.stubEnv("DEMO_MODE", "");
			const mod = await import("../../lib/config.js");
			expect(mod.isDemoMode()).toBe(false);
			vi.unstubAllEnvs();
		});
	});
});
