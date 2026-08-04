import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findById: vi.fn(),
	patch: vi.fn(),
	withPolicyLock: vi.fn(async (_id, operation) => await operation()),
}));

vi.mock("../../internal/anubis.js", () => ({
	default: { generatePolicy: vi.fn() },
}));
vi.mock("../../internal/firewall-policy.js", () => ({
	withPolicyLock: mocks.withPolicyLock,
}));

import internalNginx from "../../internal/nginx.js";

const model = {
	query: () => ({
		findById: mocks.findById,
		where: () => ({ patch: mocks.patch }),
	}),
};

const host = {
	firewall_policy_id: 7,
	id: 41,
	meta: {},
};

describe("proxy host firewall render locking", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		mocks.findById.mockReset();
		mocks.patch.mockReset().mockResolvedValue(1);
		mocks.withPolicyLock.mockClear().mockImplementation(async (_id, operation) => await operation());
		vi.spyOn(internalNginx, "backupConfig").mockResolvedValue(undefined);
		vi.spyOn(internalNginx, "deleteBackupConfig").mockResolvedValue(undefined);
		vi.spyOn(internalNginx, "generateConfig").mockResolvedValue(true);
		vi.spyOn(internalNginx, "reload").mockResolvedValue(undefined);
		vi.spyOn(internalNginx, "test").mockResolvedValue(undefined);
	});

	it("rechecks a locked policy assignment before rendering a stale proxy host snapshot", async () => {
		mocks.findById.mockResolvedValue({ firewall_policy_id: null, id: host.id });

		await internalNginx.configure(model, "proxy_host", host, { skip_reload: true });

		expect(mocks.withPolicyLock).toHaveBeenCalledWith(7, expect.any(Function));
		expect(internalNginx.generateConfig).toHaveBeenCalledWith(
			"proxy_host",
			expect.objectContaining({ firewall_policy_id: null }),
		);
	});

	it("uses the existing policy lock without recursively acquiring it when the caller already owns it", async () => {
		await internalNginx.configure(model, "proxy_host", host, {
			skip_firewall_policy_lock: true,
			skip_reload: true,
		});

		expect(mocks.withPolicyLock).not.toHaveBeenCalled();
		expect(mocks.findById).not.toHaveBeenCalled();
		expect(internalNginx.generateConfig).toHaveBeenCalledWith("proxy_host", host);
	});
});
