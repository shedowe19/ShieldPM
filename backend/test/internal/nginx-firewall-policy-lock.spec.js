import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findById: vi.fn(),
	patch: vi.fn(),
}));

vi.mock("../../internal/anubis.js", () => ({
	default: { generatePolicy: vi.fn() },
}));

import internalNginx from "../../internal/nginx.js";

const model = {
	query: () => ({
		findById: mocks.findById,
		where: () => ({ patch: mocks.patch }),
	}),
};

const host = {
	enabled: 1,
	firewall_policy_id: 7,
	id: 41,
	meta: {},
};

const activeRow = (firewall_policy_id) => ({
	enabled: 1,
	firewall_policy_id,
	id: host.id,
	is_deleted: 0,
});

describe("proxy host firewall render consistency", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		mocks.findById.mockReset();
		mocks.patch.mockReset().mockResolvedValue(1);
		vi.spyOn(internalNginx, "backupConfig").mockResolvedValue(undefined);
		vi.spyOn(internalNginx, "deleteBackupConfig").mockResolvedValue(undefined);
		vi.spyOn(internalNginx, "generateConfig").mockResolvedValue(true);
		vi.spyOn(internalNginx, "reload").mockResolvedValue(undefined);
		vi.spyOn(internalNginx, "test").mockResolvedValue(undefined);
	});

	it("rechecks an assigned policy before rendering a stale proxy host snapshot", async () => {
		mocks.findById.mockResolvedValue(activeRow(null));

		await internalNginx.configure(model, "proxy_host", host, { skip_reload: true });

		expect(internalNginx.generateConfig).toHaveBeenCalledWith(
			"proxy_host",
			expect.objectContaining({ firewall_policy_id: null }),
		);
	});

	it("rechecks an unassigned snapshot so it cannot erase a newly assigned policy", async () => {
		mocks.findById.mockResolvedValue(activeRow(7));

		await internalNginx.configure(
			model,
			"proxy_host",
			{ ...host, firewall_policy_id: null },
			{ skip_reload: true },
		);

		expect(internalNginx.generateConfig).toHaveBeenCalledWith(
			"proxy_host",
			expect.objectContaining({ firewall_policy_id: 7 }),
		);
	});

	it("refreshes every current proxy-host field before rendering a stale snapshot", async () => {
		mocks.findById.mockResolvedValue({ ...activeRow(7), enabled: 1, forward_host: "fresh.example.test" });

		await internalNginx.configure(
			model,
			"proxy_host",
			{ ...host, enabled: 0, forward_host: "stale.example.test" },
			{ skip_reload: true },
		);

		expect(internalNginx.generateConfig).toHaveBeenCalledWith(
			"proxy_host",
			expect.objectContaining({ enabled: 1, forward_host: "fresh.example.test" }),
		);
	});

	it("does not recreate a configuration after the current host was deleted or disabled", async () => {
		mocks.findById.mockResolvedValue({ ...activeRow(7), is_deleted: 1 });

		await expect(internalNginx.configure(model, "proxy_host", host, { skip_reload: true })).resolves.toEqual({});
		expect(internalNginx.generateConfig).not.toHaveBeenCalled();

		mocks.findById.mockResolvedValue({ ...activeRow(7), enabled: 0 });
		await expect(internalNginx.configure(model, "proxy_host", host, { skip_reload: true })).resolves.toEqual({});
		expect(internalNginx.generateConfig).not.toHaveBeenCalled();
	});
});
