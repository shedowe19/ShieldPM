import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ release: null, entered: vi.fn(), runtime: vi.fn() }));
vi.mock("../../bootstrap-app.js", () => ({
	prepareDatabaseStartup: () => {
		state.entered();
		return new Promise((resolve) => {
			state.release = resolve;
		});
	},
}));
vi.mock("../../runtime.js", () => {
	state.runtime();
	return {};
});
afterEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
});

it("does not even evaluate normal application modules until bootstrap resolves", async () => {
	const loading = import("../../index.js");
	await vi.waitFor(() => expect(state.entered).toHaveBeenCalledOnce());
	expect(state.runtime).not.toHaveBeenCalled();
	state.release();
	await loading;
	expect(state.runtime).toHaveBeenCalledOnce();
});
