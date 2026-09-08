import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ host: null, file: "working-config", backup: null }));
vi.mock("dockerode", () => ({ default: class {} }));
vi.mock("../../db.js", () => ({ default: () => ({}) }));
vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: () => {
			const query = {
				findById: () => query,
				where: () => query,
				withGraphFetched: () => query,
				select: async () => state.host,
				patch: async (data) => Object.assign(state.host, data),
				// biome-ignore lint/suspicious/noThenProperty: Objection queries are thenable.
				then: (resolve, reject) => Promise.resolve(state.host).then(resolve, reject),
			};
			return query;
		},
	},
}));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
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

describe("Docker discovery Nginx validation", () => {
	beforeEach(() => {
		state.host = { id: 1, enabled: 1, is_deleted: 0, meta: {} };
		state.file = "working-config";
		state.backup = null;
		vi.spyOn(nginx, "backupConfig").mockImplementation(async () => {
			state.backup = state.file;
		});
		vi.spyOn(nginx, "generateConfig").mockImplementation(async () => {
			state.file = "invalid-label-config";
		});
		vi.spyOn(nginx, "test").mockRejectedValue(new Error("invalid directive value"));
		vi.spyOn(nginx, "renameConfigAsError").mockImplementation(async () => {
			state.file = null;
		});
		vi.spyOn(nginx, "restoreConfig").mockImplementation(async () => {
			state.file = state.backup;
		});
		vi.spyOn(nginx, "deleteBackupConfig").mockResolvedValue();
		vi.spyOn(docker, "triggerReload").mockImplementation(() => {});
	});
	afterEach(() => vi.restoreAllMocks());

	it("restores a working host configuration when a discovered label produces invalid Nginx", async () => {
		await docker.configureNginx(1);
		expect(state.file).toBe("working-config");
		expect(state.host.meta).toMatchObject({
			nginx_online: false,
			nginx_err: expect.stringContaining("Rolled back"),
		});
		expect(docker.triggerReload).toHaveBeenCalledOnce();
	});

	it("validates and records a successful discovery before scheduling the shared reload", async () => {
		nginx.test.mockResolvedValue();
		await docker.configureNginx(1);
		expect(nginx.test).toHaveBeenCalledOnce();
		expect(state.host.meta).toMatchObject({ nginx_online: true, nginx_err: null });
		expect(docker.triggerReload).toHaveBeenCalledOnce();
	});
});
