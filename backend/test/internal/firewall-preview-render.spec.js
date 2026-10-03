import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test-token" }));
vi.mock("../../lib/firewall-geoip.js", () => ({ assertCountryFirewallAvailable: vi.fn() }));
vi.mock("../../internal/firewall-list.js", () => ({ default: { get: vi.fn(), getForHost: vi.fn() } }));
vi.mock("../../internal/host.js", () => ({
	default: {
		validateReferences: vi.fn().mockResolvedValue(),
		validateDomainNames: vi.fn((names) => names),
		isHostnameTaken: vi.fn().mockResolvedValue({ is_taken: false }),
		cleanSslHstsData: vi.fn((_pending, candidate) => candidate),
	},
}));
vi.mock("../../internal/proxy-host.js", () => ({ default: { get: vi.fn() } }));
vi.mock("../../internal/upload-relay.js", () => ({ validateRelayConfigForHost: vi.fn() }));

import lists from "../../internal/firewall-list.js";
import nginx from "../../internal/nginx.js";
import proxyHost from "../../internal/proxy-host.js";
import preview from "../../internal/proxy-host-preview.js";
import { MAX_PREVIEW_CONFIG_BYTES } from "../../lib/firewall-preview.js";

const entries = Array.from(
	{ length: 200_000 },
	(_, index) => `10.${index >>> 16}.${(index >>> 8) & 255}.${index & 255}`,
);
const host = {
	id: 17,
	enabled: true,
	domain_names: ["protected.test"],
	forward_scheme: "http",
	forward_host: "127.0.0.1",
	forward_port: 8080,
	meta: { ip_firewall: { enabled: true, list_ids: [9], allowlist: [], denylist: [] } },
};
const access = { can: vi.fn().mockResolvedValue({}), token: { getUserId: () => 2 } };

const readableHandle = (text) => {
	const source = Buffer.from(text);
	let position = 0;
	return {
		stat: vi.fn().mockResolvedValue({ isFile: () => true, size: source.length }),
		read: vi.fn(async (buffer, offset, length) => {
			const bytesRead = Math.min(length, source.length - position);
			source.copy(buffer, offset, position, position + bytesRead);
			position += bytesRead;
			return { bytesRead };
		}),
		close: vi.fn().mockResolvedValue(),
	};
};

describe("bounded firewall config previews", () => {
	beforeEach(() => {
		lists.get.mockResolvedValue({ id: 9 });
		lists.getForHost.mockResolvedValue([{ id: 9, name: "Large list", reason: "VPN traffic", entries }]);
		proxyHost.get.mockResolvedValue(host);
	});
	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it("previews a valid 200,000-entry subscription without changing runtime enforcement", async () => {
		expect(Buffer.byteLength(entries.join("\n"))).toBeLessThan(8 * 1024 * 1024);
		const runtime = await nginx.renderConfig("proxy_host", host);
		expect(Buffer.byteLength(runtime)).toBeGreaterThan(MAX_PREVIEW_CONFIG_BYTES);
		expect(runtime).toContain("10.0.0.1/32 1;");
		expect(runtime).not.toContain("CIDRs omitted");
		const handle = readableHandle(runtime.replace(/\n/g, "\r\n"));
		vi.spyOn(fs.promises, "open").mockResolvedValue(handle);
		const result = await preview.preview(access, { domain_names: ["protected.test"] }, 17);
		expect(result.limitations).toContain("firewall-rule-summaries");
		expect(result.config).toContain("200000 rules; SHA-256");
		expect(result.diff).not.toMatch(/^[+-].*200000 rules;/m);
		expect(Buffer.byteLength(result.config)).toBeLessThan(MAX_PREVIEW_CONFIG_BYTES);
		expect(Buffer.byteLength(result.diff)).toBeLessThan(MAX_PREVIEW_CONFIG_BYTES);
		expect(`${result.config}\n${result.diff}`).not.toContain("10.0.0.1");
		expect(result.hasCurrent).toBe(true);
		expect(handle.read.mock.calls.length).toBeGreaterThan(1);
		expect(handle.close).toHaveBeenCalledOnce();
	}, 30_000);

	it("shows address changes through the hash while retaining the count and hiding both old and new CIDRs", async () => {
		const runtime = await nginx.renderConfig("proxy_host", host);
		lists.getForHost.mockResolvedValue([
			{ id: 9, name: "Large list", reason: "VPN traffic", entries: [...entries.slice(0, -1), "203.0.113.42"] },
		]);
		vi.spyOn(fs.promises, "open").mockResolvedValue(readableHandle(runtime));
		const result = await preview.preview(access, { domain_names: ["protected.test"] }, 17);
		expect(result.diff).toMatch(/^-.*200000 rules; SHA-256/m);
		expect(result.diff).toMatch(/^\+.*200000 rules; SHA-256/m);
		expect(`${result.config}\n${result.diff}`).not.toMatch(/10\.0\.0\.1|203\.0\.113\.42/);
	}, 30_000);

	it("summarizes stale active CIDRs even when the draft and stored host no longer reference their list", async () => {
		const runtime = await nginx.renderConfig("proxy_host", host);
		const current = { ...host, meta: { ip_firewall: { enabled: false, list_ids: [] } } };
		proxyHost.get.mockResolvedValue(current);
		vi.spyOn(fs.promises, "open").mockResolvedValue(readableHandle(runtime));
		const result = await preview.preview(access, { domain_names: ["protected.test"] }, 17);
		expect(result.limitations).toContain("firewall-rule-summaries");
		expect(result.diff).toMatch(/^-.*200000 rules; SHA-256/m);
		expect(result.diff).not.toContain("10.0.0.1");
		expect(lists.get).not.toHaveBeenCalled();
	}, 30_000);
});
