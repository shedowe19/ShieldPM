import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ meta: {}, push: vi.fn(), pull: vi.fn() }));
vi.mock("../../db.js", () => ({ default: () => ({}) }));
vi.mock("../../lib/config.js", () => ({ isDemoMode: () => false }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: vi.fn(), decrypt: vi.fn() }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../models/setting.js", () => ({
	default: {
		query: () => ({
			where: () => ({
				first: async () => ({ id: "gitops-config", meta: { ...state.meta } }),
				patch: async ({ meta }) => {
					state.meta = { ...meta };
					return 1;
				},
			}),
		}),
	},
}));
vi.mock("isomorphic-git", () => ({ default: { push: state.push, pull: state.pull } }));

import gitops from "../../internal/gitops.js";

const access = { can: vi.fn().mockResolvedValue(true) };

describe("disabled GitOps synchronization", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		state.meta = {
			enabled: true,
			auto_push: true,
			auto_pull_on_startup: true,
			repository_url: "https://example.test/config.git",
		};
		gitops._autoPushTimer = null;
		vi.spyOn(gitops, "initRepo").mockResolvedValue();
		vi.spyOn(gitops, "exportConfig").mockResolvedValue([]);
	});
	afterEach(() => {
		vi.clearAllTimers();
		gitops._autoPushTimer = null;
		vi.useRealTimers();
		vi.restoreAllMocks();
	});
	it("skips startup pulls, manual network operations and automatic export while disabled", async () => {
		state.meta.enabled = false;
		await gitops.init();
		gitops.triggerAutoPush("proxy-host");
		await vi.advanceTimersByTimeAsync(5000);
		expect(await gitops.commitAndPush()).toMatchObject({ success: false });
		expect(await gitops.pull()).toMatchObject({ success: false });
		expect(gitops.initRepo).not.toHaveBeenCalled();
		expect(gitops.exportConfig).not.toHaveBeenCalled();
		expect(state.push).not.toHaveBeenCalled();
		expect(state.pull).not.toHaveBeenCalled();
	});
	it.each([{ enabled: false }, { auto_push: false }, { repository_url: "" }])(
		"cancels a pending automatic backup when configuration changes to %j",
		async (change) => {
			gitops.triggerAutoPush("proxy-host");
			expect(vi.getTimerCount()).toBe(1);
			await gitops.updateConfig(access, change);
			expect(gitops._autoPushTimer).toBeNull();
			expect(vi.getTimerCount()).toBe(0);
			await gitops.updateConfig(access, {
				enabled: true,
				auto_push: true,
				repository_url: "https://example.test/config.git",
			});
			await vi.advanceTimersByTimeAsync(5000);
			expect(gitops.exportConfig).not.toHaveBeenCalled();
			expect(state.push).not.toHaveBeenCalled();
		},
	);
	it("pushes a new change after synchronization has been re-enabled", async () => {
		state.meta.enabled = false;
		await gitops.updateConfig(access, { enabled: true });
		const push = vi.spyOn(gitops, "commitAndPush").mockResolvedValue({ success: true });
		gitops.triggerAutoPush("proxy-host");
		await vi.advanceTimersByTimeAsync(5000);
		expect(gitops.exportConfig).toHaveBeenCalledOnce();
		expect(push).toHaveBeenCalledExactlyOnceWith("Auto-backup: proxy-host changed");
		expect(gitops._autoPushTimer).toBeNull();
	});
});
