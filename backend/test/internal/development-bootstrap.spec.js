import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ importedPath: null, listen: vi.fn(), log: vi.fn() }));
vi.mock("../../app.js", () => {
	state.importedPath = process.env.DATA_PATH;
	return { default: { listen: state.listen } };
});
vi.mock("../../internal/analytics.js", () => ({ default: { init: vi.fn() } }));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/ip_ranges.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../lib/utils.js", () => ({ default: { execFile: vi.fn() } }));
vi.mock("../../logger.js", () => ({ global: { info: state.log, error: state.log } }));
vi.mock("../../migrate.js", () => ({ migrateUp: vi.fn() }));
vi.mock("../../schema/index.js", () => ({ getCompiledSchema: vi.fn() }));
vi.mock("../../setup.js", () => ({ default: vi.fn() }));

describe("development bootstrap isolation", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		vi.stubEnv("DATA_PATH", "");
		vi.stubEnv("INITIAL_ADMIN_EMAIL", "");
		vi.stubEnv("INITIAL_ADMIN_PASSWORD", "");
		vi.stubEnv("INITIAL_DEFAULT_PAGE", "");
		state.listen.mockImplementation((_port, _host, ready) => ready());
	});
	afterEach(() => vi.unstubAllEnvs());

	it("sets local storage before application imports and binds development access to loopback", async () => {
		await import("../../index-dev.js");
		await vi.waitFor(() => expect(state.listen).toHaveBeenCalled());
		expect(state.importedPath).toBe(`${process.cwd()}/data`);
		expect(state.listen).toHaveBeenCalledWith(3000, "127.0.0.1", expect.any(Function));
		expect(state.log.mock.calls.flat().join(" ")).not.toContain("changeme");
	});

	it("preserves an explicitly configured development path and administrator credentials", async () => {
		vi.stubEnv("DATA_PATH", "/tmp/chosen-development-data");
		vi.stubEnv("INITIAL_ADMIN_EMAIL", "developer@example.test");
		vi.stubEnv("INITIAL_ADMIN_PASSWORD", "chosen-test-password");
		await import("../../index-dev.js");
		await vi.waitFor(() => expect(state.listen).toHaveBeenCalled());
		expect(process.env.DATA_PATH).toBe("/tmp/chosen-development-data");
		expect(process.env.INITIAL_ADMIN_EMAIL).toBe("developer@example.test");
		expect(process.env.INITIAL_ADMIN_PASSWORD).toBe("chosen-test-password");
		expect(state.log.mock.calls.flat().join(" ")).not.toContain("chosen-test-password");
	});
});
