import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), list: vi.fn(), start: vi.fn(), stop: vi.fn() }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/git-deploy.js", () => ({ default: { stopPolling: vi.fn(), startPollingForHost: vi.fn() } }));
vi.mock("../../internal/gitops.js", () => ({ default: {} }));
vi.mock("../../internal/host.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: { configure: vi.fn(), deleteConfig: vi.fn(), reload: vi.fn() } }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: { start: mocks.start, stop: mocks.stop } }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: vi.fn() }));
vi.mock("../../lib/utils.js", () => ({ default: {} }));
vi.mock("../../models/access_list.js", () => ({
	default: {
		query: () => {
			const query = { where: () => query, first: mocks.list };
			return query;
		},
	},
}));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: mocks.query } }));

import proxyHost from "../../internal/proxy-host.js";

const accessList = { id: 12, meta: { auth_type: "oauth2_proxy" } };
const access = { can: vi.fn().mockResolvedValue(true) };
const makeQuery = (remainingHosts = []) => {
	const query = Object.assign(Promise.resolve(remainingHosts), { where: vi.fn(), patch: vi.fn() });
	query.where.mockReturnValue(query);
	query.patch.mockResolvedValue(1);
	return query;
};

describe("Proxy host OAuth2 lifecycle", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.list.mockResolvedValue(accessList);
	});
	afterEach(() => vi.restoreAllMocks());

	it("starts OAuth2 after a disabled host is enabled", async () => {
		vi.spyOn(proxyHost, "get").mockResolvedValue({ id: 1, access_list_id: 12, enabled: 0 });
		mocks.query.mockReturnValue(makeQuery());
		await proxyHost.enable(access, { id: 1 });
		expect(mocks.start).toHaveBeenCalledWith(accessList);
	});

	it("stops OAuth2 after the last active host is disabled", async () => {
		vi.spyOn(proxyHost, "get").mockResolvedValue({ id: 1, access_list_id: 12, enabled: 1 });
		const query = makeQuery();
		mocks.query.mockReturnValue(query);
		await proxyHost.disable(access, { id: 1 });
		expect(query.where).toHaveBeenCalledWith("enabled", 1);
		expect(mocks.stop).toHaveBeenCalledWith(12);
		expect(mocks.start).not.toHaveBeenCalled();
	});

	it("refreshes redirect domains when other active hosts remain", async () => {
		vi.spyOn(proxyHost, "get").mockResolvedValue({ id: 1, access_list_id: 12, enabled: 1 });
		mocks.query.mockReturnValue(makeQuery([{ id: 2, enabled: 1 }]));
		await proxyHost.disable(access, { id: 1 });
		expect(mocks.start).toHaveBeenCalledWith(accessList);
		expect(mocks.stop).not.toHaveBeenCalled();
	});
});
