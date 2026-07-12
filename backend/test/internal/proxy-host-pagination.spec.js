import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	query: vi.fn(),
	relatedQuery: vi.fn(),
}));

vi.mock("../../internal/audit-log.js", () => ({ default: {} }));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/git-deploy.js", () => ({ default: {} }));
vi.mock("../../internal/gitops.js", () => ({ default: {} }));
vi.mock("../../internal/host.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: {} }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: vi.fn() }));
vi.mock("../../lib/error.js", () => ({ default: {} }));
vi.mock("../../lib/utils.js", () => ({ default: {} }));
vi.mock("../../models/access_list.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: mocks.query,
		relatedQuery: mocks.relatedQuery,
	},
}));

import internalProxyHost from "../../internal/proxy-host.js";

const createHosts = (count) =>
	Array.from({ length: count }, (_, index) => ({
		access_list_id: 0,
		domain_names: [`host-${index + 1}.example.test`],
		id: index + 1,
	}));

const createQuery = (allRows, pageResult) => {
	const query = Object.assign(Promise.resolve(allRows), {
		allowGraph: vi.fn(),
		andWhere: vi.fn(),
		groupBy: vi.fn(),
		orderBy: vi.fn(),
		page: vi.fn(),
		where: vi.fn(),
		whereExists: vi.fn(),
		withGraphFetched: vi.fn(),
	});

	for (const method of ["allowGraph", "andWhere", "groupBy", "orderBy", "where", "whereExists", "withGraphFetched"]) {
		query[method].mockReturnValue(query);
	}
	query.page.mockResolvedValue(pageResult);

	return query;
};

const createAccess = (permissionVisibility = "all") => ({
	can: vi.fn().mockResolvedValue({ permission_visibility: permissionVisibility }),
	token: { getUserId: vi.fn().mockReturnValue(7) },
});

describe("proxy host pagination", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns only the requested 100 of 1,000 synthetic hosts with total page metadata", async () => {
		const allRows = createHosts(1000);
		const pageRows = allRows.slice(0, 100);
		const query = createQuery(allRows, { results: pageRows, total: allRows.length });
		mocks.query.mockReturnValue(query);

		const result = await internalProxyHost.getAll(createAccess(), undefined, undefined, { limit: 100, page: 1 });

		expect(query.page).toHaveBeenCalledWith(0, 100);
		expect(result).toMatchObject({
			items: pageRows,
			pagination: { limit: 100, page: 1, totalItems: 1000, totalPages: 10 },
		});
		expect(result.items).toHaveLength(100);
	});

	it("applies owner and domain search restrictions before requesting a later page", async () => {
		const pageRows = createHosts(50);
		const query = createQuery(createHosts(1000), { results: pageRows, total: 73 });
		const relatedQuery = { where: vi.fn().mockReturnThis(), whereRaw: vi.fn().mockReturnThis() };
		const searchConditions = {
			orWhere: vi.fn().mockReturnThis(),
			orWhereRaw: vi.fn().mockReturnThis(),
			whereExists: vi.fn().mockReturnThis(),
		};
		mocks.query.mockReturnValue(query);
		mocks.relatedQuery.mockReturnValue(relatedQuery);
		const access = createAccess("user");

		await internalProxyHost.getAll(access, undefined, "service", { limit: 50, page: 2 });

		expect(query.where).toHaveBeenNthCalledWith(2, expect.any(Function));
		query.where.mock.calls[1][0](searchConditions);

		expect(access.can).toHaveBeenCalledWith("proxy_hosts:list");
		expect(query.andWhere).toHaveBeenCalledWith("owner_user_id", 7);
		expect(mocks.relatedQuery).toHaveBeenCalledWith("host_domains");
		expect(relatedQuery.whereRaw).toHaveBeenCalledWith("?? LIKE ? ESCAPE '!'", ["domain_name", "%service%"]);
		expect(searchConditions.whereExists).toHaveBeenCalledWith(relatedQuery);
		expect(searchConditions.orWhereRaw).toHaveBeenCalledWith("?? LIKE ? ESCAPE '!'", ["forward_host", "%service%"]);
		expect(query.page).toHaveBeenCalledWith(1, 50);
	});

	it("treats SQL LIKE wildcard characters in a host search as literal text", async () => {
		const query = createQuery(createHosts(1), { results: createHosts(1), total: 1 });
		const relatedQuery = { where: vi.fn().mockReturnThis(), whereRaw: vi.fn().mockReturnThis() };
		const searchConditions = {
			orWhere: vi.fn().mockReturnThis(),
			orWhereRaw: vi.fn().mockReturnThis(),
			whereExists: vi.fn().mockReturnThis(),
		};
		mocks.query.mockReturnValue(query);
		mocks.relatedQuery.mockReturnValue(relatedQuery);

		await internalProxyHost.getAll(createAccess(), undefined, "service_%", { limit: 100, page: 1 });

		query.where.mock.calls[1][0](searchConditions);
		expect(relatedQuery.whereRaw).toHaveBeenCalledWith("?? LIKE ? ESCAPE '!'", ["domain_name", "%service!_!%%"]);
		expect(searchConditions.orWhereRaw).toHaveBeenCalledWith("?? LIKE ? ESCAPE '!'", [
			"forward_host",
			"%service!_!%%",
		]);
	});
});
