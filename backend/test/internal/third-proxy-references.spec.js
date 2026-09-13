import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ certificate: vi.fn(), list: vi.fn(), query: vi.fn() }));
vi.mock("../../internal/certificate.js", () => ({ default: { get: mocks.certificate } }));
vi.mock("../../internal/access-list.js", () => ({ default: { get: mocks.list } }));
vi.mock("../../internal/audit-log.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../internal/git-deploy.js", () => ({ default: {} }));
vi.mock("../../internal/gitops.js", () => ({ default: {} }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: {} }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: vi.fn() }));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: mocks.query } }));
vi.mock("../../models/dead_host.js", () => ({ default: { query: mocks.query } }));
vi.mock("../../models/redirection_host.js", () => ({ default: { query: mocks.query } }));
vi.mock("../../models/stream.js", () => ({ default: { query: mocks.query } }));
vi.mock("../../models/access_list.js", () => ({ default: {} }));

import dead from "../../internal/dead-host.js";
import host from "../../internal/host.js";
import proxy from "../../internal/proxy-host.js";
import redirect from "../../internal/redirection-host.js";
import stream from "../../internal/stream.js";

const access = { can: vi.fn().mockResolvedValue({ permission_visibility: "user" }), token: { getUserId: () => 7 } };
const services = [proxy, dead, redirect, stream];

describe("host references use the referenced resource's authorization", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.certificate.mockRejectedValue(new Error("Certificate not visible"));
		mocks.list.mockRejectedValue(new Error("Access list not visible"));
	});
	afterEach(() => vi.restoreAllMocks());
	it.each(services)("rejects inaccessible TLS references before creating a host", async (service) => {
		await expect(service.create(access, { domain_names: ["example.test"], certificate_id: 99 })).rejects.toThrow(
			"Certificate not visible",
		);
		expect(mocks.certificate).toHaveBeenCalledExactlyOnceWith(access, { id: 99 });
		expect(mocks.query).not.toHaveBeenCalled();
	});
	it.each(services)("rejects inaccessible TLS replacements before updating a host", async (service) => {
		vi.spyOn(service, "get").mockResolvedValue({ id: 1, certificate_id: 2 });
		await expect(service.update(access, { id: 1, certificate_id: 99 })).rejects.toThrow("Certificate not visible");
		expect(mocks.certificate).toHaveBeenCalledExactlyOnceWith(access, { id: 99 });
		expect(mocks.query).not.toHaveBeenCalled();
	});
	it.each(["create", "update"])("rejects inaccessible access lists on proxy %s", async (operation) => {
		vi.spyOn(proxy, "get").mockResolvedValue({ id: 1, access_list_id: 2 });
		await expect(
			proxy[operation](access, {
				id: 1,
				domain_names: operation === "create" ? ["example.test"] : undefined,
				access_list_id: 99,
			}),
		).rejects.toThrow("Access list not visible");
		expect(mocks.list).toHaveBeenCalledExactlyOnceWith(access, { id: 99 });
		expect(mocks.query).not.toHaveBeenCalled();
	});
	it("keeps existing assignments editable and allows clearing them without loading resources", async () => {
		await host.validateReferences(
			access,
			{ certificate_id: 2, access_list_id: 3 },
			{ certificate_id: 2, access_list_id: 3 },
		);
		await host.validateReferences(access, { certificate_id: 0, access_list_id: 0 });
		await host.validateReferences(access, { certificate_id: "new" });
		expect(mocks.certificate).not.toHaveBeenCalled();
		expect(mocks.list).not.toHaveBeenCalled();
	});
	it("permits assignments after both referenced services authorize them", async () => {
		mocks.certificate.mockResolvedValueOnce({ id: 2 });
		mocks.list.mockResolvedValueOnce({ id: 3 });
		await expect(
			host.validateReferences(access, { certificate_id: 2, access_list_id: 3 }),
		).resolves.toBeUndefined();
		expect(mocks.certificate).toHaveBeenCalledExactlyOnceWith(access, { id: 2 });
		expect(mocks.list).toHaveBeenCalledExactlyOnceWith(access, { id: 3 });
	});
});
