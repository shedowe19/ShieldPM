import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	files: new Map(),
	firstConfigWriteReached: null,
	policies: [],
	releaseFirstConfigWrite: null,
	waitForFirstConfigWrite: false,
}));

vi.mock("node:fs/promises", () => ({
	default: {
		mkdir: vi.fn(async () => undefined),
		readFile: vi.fn(async (filename) => {
			if (!state.files.has(filename)) throw Object.assign(new Error(`ENOENT: ${filename}`), { code: "ENOENT" });
			return state.files.get(filename);
		}),
		rename: vi.fn(async (source, target) => {
			if (target === "/data/nginx/firewall.conf" && state.waitForFirstConfigWrite) {
				state.waitForFirstConfigWrite = false;
				state.firstConfigWriteReached();
				await new Promise((resolve) => {
					state.releaseFirstConfigWrite = resolve;
				});
			}
			state.files.set(target, state.files.get(source));
			state.files.delete(source);
		}),
		rm: vi.fn(async () => undefined),
		writeFile: vi.fn(async (filename, content, options = {}) => {
			if (options.flag === "a" && state.files.has(filename)) return;
			state.files.set(filename, String(content));
		}),
	},
}));
vi.mock("../../internal/audit-log.js", () => ({ default: {} }));
vi.mock("../../internal/gitops.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../models/firewall_policy.js", () => ({
	default: {
		query: () => ({ orderBy: async () => state.policies.map((policy) => ({ ...policy })) }),
	},
}));

import { writeFirewallConfig } from "../../internal/firewall-policy.js";

describe("shared firewall map rendering", () => {
	beforeEach(() => {
		state.files.clear();
		state.policies = [{ action: "deny", block_cidrs: [], feed_urls: [], id: 1 }];
		state.releaseFirstConfigWrite = null;
		state.waitForFirstConfigWrite = true;
	});

	it("cannot let an older policy snapshot replace a newer global map", async () => {
		const firstConfigWrite = new Promise((resolve) => {
			state.firstConfigWriteReached = resolve;
		});
		const firstWrite = writeFirewallConfig();
		await firstConfigWrite;

		state.policies = [
			{ action: "deny", block_cidrs: [], feed_urls: [], id: 1 },
			{ action: "drop", block_cidrs: ["203.0.113.0/24"], feed_urls: [], id: 2 },
		];
		const secondWrite = writeFirewallConfig();
		state.releaseFirstConfigWrite();
		await Promise.all([firstWrite, secondWrite]);

		expect(state.files.get("/data/nginx/firewall.conf")).toContain("$shieldpm_firewall_2_enabled");
	});
});
