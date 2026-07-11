import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execSync: vi.fn(),
	existsSync: vi.fn(),
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
	mkdirSync: vi.fn(),
	peerQuery: vi.fn(),
	readFileSync: vi.fn(),
	settingQuery: vi.fn(),
	writeFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({ execSync: mocks.execSync, spawn: vi.fn() }));
vi.mock("node:fs", () => ({
	default: {
		existsSync: mocks.existsSync,
		mkdirSync: mocks.mkdirSync,
		readFileSync: mocks.readFileSync,
		writeFileSync: mocks.writeFileSync,
	},
}));
vi.mock("../../logger.js", () => ({ global: mocks.logger }));
vi.mock("../../models/setting.js", () => ({ default: { query: mocks.settingQuery } }));
vi.mock("../../models/wireguard_peer.js", () => ({ default: { query: mocks.peerQuery } }));

import internalWireguard from "../../internal/wireguard.js";

const createQuery = (result = []) => {
	const query = Promise.resolve(result);
	Object.assign(query, {
		andWhere: () => query,
		patch: () => query,
		where: () => query,
	});
	return query;
};

const countOccurrences = (text, value) => text.split(value).length - 1;

describe("WireGuard firewall isolation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.existsSync.mockReturnValue(true);
		mocks.readFileSync.mockReturnValue("server-private-key");
		mocks.settingQuery.mockImplementation(() => ({
			where: () => ({ first: async () => ({ meta: {} }) }),
		}));
		mocks.peerQuery.mockImplementation(() => createQuery());
		mocks.execSync.mockImplementation((command) => {
			if (command === "which wg") return "/usr/bin/wg";
			if (command.startsWith("ip link show")) throw new Error("wg0 is down");
			return "";
		});
	});

	it("preserves built-in chains while configuring each ShieldPM WireGuard rule exactly once", async () => {
		await internalWireguard.init();

		expect(mocks.execSync).not.toHaveBeenCalledWith("iptables -F FORWARD", expect.any(Object));
		expect(mocks.execSync).not.toHaveBeenCalledWith("iptables -t nat -F POSTROUTING", expect.any(Object));
		expect(mocks.execSync).not.toHaveBeenCalledWith("iptables -t mangle -F POSTROUTING", expect.any(Object));

		const config = mocks.writeFileSync.mock.calls.find(([path]) => path.endsWith("/wireguard/wg0.conf"))?.[1];
		expect(config).toEqual(expect.any(String));
		expect(config).toContain("iptables -C INPUT -j SHIELDPM_WG_INPUT");
		expect(config).toContain("iptables -C FORWARD -j SHIELDPM_WG_FORWARD");
		expect(config).toContain("iptables -t nat -C POSTROUTING -j SHIELDPM_WG_NAT");
		expect(config).toContain("iptables -t mangle -C POSTROUTING -j SHIELDPM_WG_MANGLE_POST");
		expect(config).toContain("iptables -t mangle -C FORWARD -j SHIELDPM_WG_MANGLE_FORWARD");
		expect(config).not.toContain("iptables -F FORWARD");
		expect(config).not.toContain("iptables -t nat -F POSTROUTING");
		expect(config).not.toContain("iptables -t mangle -F POSTROUTING");

		for (const rule of [
			"iptables -A SHIELDPM_WG_INPUT -i wg0 -j ACCEPT",
			"iptables -A SHIELDPM_WG_FORWARD -i wg0 -j ACCEPT",
			"iptables -t nat -A SHIELDPM_WG_NAT -o eth0 -j MASQUERADE",
			"iptables -t mangle -A SHIELDPM_WG_MANGLE_POST -o wg0 -p tcp -m tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu",
			"iptables -t mangle -A SHIELDPM_WG_MANGLE_FORWARD -i wg0 -p tcp -m tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu",
		]) {
			expect(countOccurrences(config, rule)).toBe(1);
		}
	});

	it("does not remove unmarked legacy direct rules that could belong to another firewall manager", async () => {
		await internalWireguard.init();

		const config = mocks.writeFileSync.mock.calls.find(([path]) => path.endsWith("/wireguard/wg0.conf"))?.[1];
		expect(config).toEqual(expect.any(String));
		for (const legacyRule of [
			"iptables -D INPUT -i wg0 -j ACCEPT 2>/dev/null || true",
			"iptables -D FORWARD -i wg0 -j ACCEPT 2>/dev/null || true",
			"iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE 2>/dev/null || true",
			"iptables -t mangle -D POSTROUTING -o wg0 -p tcp -m tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu 2>/dev/null || true",
			"iptables -t mangle -D FORWARD -i wg0 -p tcp -m tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu 2>/dev/null || true",
		]) {
			expect(config).not.toContain(legacyRule);
		}
	});
});
