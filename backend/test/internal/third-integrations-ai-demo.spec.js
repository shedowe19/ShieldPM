import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	demo: true,
	mutate: vi.fn(),
	tor: vi.fn(),
	torCreate: vi.fn(),
	torStart: vi.fn(),
	audit: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({
	getEncryptionKey: vi.fn().mockReturnValue("0".repeat(64)),
	isDemoMode: () => mocks.demo,
}));
vi.mock("../../models/cloudflared_tunnel.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../models/tor_onion.js", () => ({ default: { query: mocks.tor } }));
vi.mock("../../internal/access-list.js", () => ({ default: {} }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: mocks.audit } }));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/cloudflared.js", () => ({ default: {} }));
vi.mock("../../internal/ddns-provider.js", () => ({ default: {} }));
vi.mock("../../internal/dead-host.js", () => ({ default: { create: mocks.mutate, update: mocks.mutate } }));
vi.mock("../../internal/ip_ranges.js", () => ({ default: {} }));
vi.mock("../../internal/maintenance.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../internal/pki.js", () => ({ default: {} }));
vi.mock("../../internal/proxy-host.js", () => ({ default: {} }));
vi.mock("../../internal/redirection-host.js", () => ({ default: { create: mocks.mutate, update: mocks.mutate } }));
vi.mock("../../internal/report.js", () => ({ default: {} }));
vi.mock("../../internal/setting.js", () => ({ default: {} }));
vi.mock("../../internal/stream.js", () => ({ default: { create: mocks.mutate, update: mocks.mutate } }));
vi.mock("../../internal/token.js", () => ({ default: {} }));
vi.mock("../../internal/tor.js", () => ({ default: { create: mocks.torCreate, start: mocks.torStart } }));
vi.mock("../../internal/user.js", () => ({ default: {} }));

import { executeTools } from "../../internal/ai/executor.js";

const access = { can: vi.fn().mockResolvedValue(true), token: { getUserId: () => 7 } };

describe("AI Demo route parity", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.demo = true;
		vi.spyOn(console, "error").mockImplementation(() => {});
		mocks.mutate.mockResolvedValue({ id: 3 });
	});
	afterEach(() => vi.restoreAllMocks());
	it.each(["create_stream", "update_stream"])("blocks internal forwarding_host for %s", async (name) => {
		for (const host of ["127.0.0.1", "[::1]", "LOCALHOST.", "0.0.0.0", "[::ffff:127.0.0.1]"]) {
			const result = await executeTools(access, [{ name, args: { id: 3, forwarding_host: host } }]);
			expect(result[0].result).toContain("Demo Mode");
		}
		expect(mocks.mutate).not.toHaveBeenCalled();
	});
	it.each(["update_redirection_host", "update_dead_host"])("blocks advanced configuration in %s", async (name) => {
		const result = await executeTools(access, [
			{ name, args: { id: 3, advanced_config: "include /data/custom.conf;" } },
		]);
		expect(result[0].result).toContain("Demo Mode");
		expect(mocks.mutate).not.toHaveBeenCalled();
	});
	it.each([
		"create_tor_onion_service",
		"update_tor_onion_service",
		"delete_tor_onion_service",
		"start_tor_onion_service",
		"stop_tor_onion_service",
	])("blocks %s before looking up Tor services", async (name) => {
		const result = await executeTools(access, [{ name, args: { id: 3 } }]);
		expect(result[0].result).toContain("Demo Mode");
		expect(mocks.tor).not.toHaveBeenCalled();
	});
	it("continues forwarding public demo streams and private non-demo streams", async () => {
		expect(
			(await executeTools(access, [{ name: "create_stream", args: { forwarding_host: "1.1.1.1" } }]))[0].result,
		).toBe("Created Stream ID: 3");
		mocks.demo = false;
		expect(
			(await executeTools(access, [{ name: "create_stream", args: { forwarding_host: "127.0.0.1" } }]))[0].result,
		).toBe("Created Stream ID: 3");
		expect(mocks.mutate).toHaveBeenCalledTimes(2);
	});
	it.each(["create_tor_onion_service", "start_tor_onion_service"])(
		"reports the failed %s tool without a success audit",
		async (name) => {
			mocks.demo = false;
			const service = { id: 3, private_key: "key" };
			const query = {
				where: () => query,
				andWhere: () => query,
				first: async () => service,
				insert: async () => service,
			};
			mocks.tor.mockReturnValue(query);
			mocks.torCreate.mockResolvedValue(null);
			mocks.torStart.mockResolvedValue(false);
			const result = await executeTools(access, [{ name, args: { id: 3 } }]);
			expect(result[0].result).toMatch(/^Error: Unable to (create|start) onion service$/);
			expect(mocks.audit).not.toHaveBeenCalled();
		},
	);
});
