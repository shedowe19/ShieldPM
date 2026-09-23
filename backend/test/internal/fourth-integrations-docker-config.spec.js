import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ hosts: [] }));
vi.mock("dockerode", () => ({ default: class {} }));
vi.mock("../../db.js", () => ({ default: () => ({}) }));
vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: () => {
			const query = {
				findById: () => query,
				forUpdate: () => query,
				where: () => query,
				whereIn: () => query,
				withGraphFetched: () => query,
				// biome-ignore lint/suspicious/noThenProperty: Objection queries are thenable.
				then: (resolve, reject) => Promise.resolve(state.hosts).then(resolve, reject),
			};
			return query;
		},
	},
}));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/proxy-host-monitor.js", () => ({ default: { resetHost: vi.fn() } }));
vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: vi.fn() }));
vi.mock("../../lib/utils.js", () => ({ default: {} }));
vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
	nginx: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
	debug: vi.fn(),
}));

import docker from "../../internal/docker.js";
import nginx from "../../internal/nginx.js";
import ProxyHost from "../../models/proxy_host.js";

describe("Docker discovery Nginx batching", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		state.hosts = [{ id: 1, enabled: 1, is_deleted: 0, meta: {} }];
		docker.pendingHostIds?.clear();
		if (docker.reloadTimer) clearTimeout(docker.reloadTimer);
		docker.reloadTimer = null;
		vi.spyOn(nginx, "bulkGenerateConfigs").mockResolvedValue([]);
		vi.spyOn(nginx, "reload").mockResolvedValue();
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("coalesces repeated container updates into one validated batch and one reload", async () => {
		await docker.configureNginx(1);
		await docker.configureNginx(1);
		expect(nginx.bulkGenerateConfigs).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(2_000);

		expect(nginx.bulkGenerateConfigs).toHaveBeenCalledExactlyOnceWith(ProxyHost, "proxy_host", state.hosts);
		expect(nginx.reload).toHaveBeenCalledOnce();
	});
});
