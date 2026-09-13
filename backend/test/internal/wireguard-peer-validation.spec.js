import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), exec: vi.fn() }));
vi.mock("node:child_process", () => ({ execSync: mocks.exec, spawn: vi.fn() }));
vi.mock("../../models/wireguard_peer.js", () => ({ default: { query: mocks.query } }));
vi.mock("../../models/setting.js", () => ({ default: {} }));
vi.mock("../../logger.js", () => ({ global: {} }));

import wireguard from "../../internal/wireguard.js";

describe("WireGuard peer configuration injection", () => {
	it.each([
		{ name: "peer\nPostUp = unexpected-command" },
		{ dns: "1.1.1.1\nPostUp = unexpected-command" },
		{ allowed_ips: "0.0.0.0/0\nPostUp = unexpected-command" },
		{ allowed_ips: "not-a-cidr" },
		{ persistent_keepalive: -1 },
	])("rejects invalid peer data before database or process operations: %j", async (data) => {
		await expect(wireguard.createPeer(data, 1)).rejects.toThrow(/WireGuard/);
		await expect(wireguard.updatePeer(1, data)).rejects.toThrow(/WireGuard/);
		expect(mocks.query).not.toHaveBeenCalled();
		expect(mocks.exec).not.toHaveBeenCalled();
	});
});
