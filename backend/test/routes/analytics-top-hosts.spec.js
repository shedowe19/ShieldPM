import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	analyticCountQuery: vi.fn(),
	middlewares: [],
	proxyHostQuery: vi.fn(),
	routes: new Map(),
}));

vi.mock("express", () => ({
	default: {
		Router: () => {
			const router = {
				get: (path, handler) => {
					mocks.routes.set(path, handler);
					return router;
				},
				use: (middleware) => {
					mocks.middlewares.push(middleware);
					return router;
				},
			};
			return router;
		},
	},
}));

vi.mock("systeminformation", () => ({ default: { networkStats: vi.fn() } }));
vi.mock("../../lib/config.js", () => ({ isMysql: vi.fn(), isPostgres: vi.fn(), isSqlite: vi.fn() }));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => () => undefined }));
vi.mock("../../models/analytic_count.js", () => ({ default: { query: mocks.analyticCountQuery } }));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: mocks.proxyHostQuery } }));

import "../../routes/analytics.js";

const createResponse = () => ({
	json: vi.fn(),
	status: vi.fn().mockReturnThis(),
});

const createTopHostsQuery = (rows) => {
	const query = {
		alias: vi.fn(),
		andWhere: vi.fn(),
		groupBy: vi.fn(),
		join: vi.fn(),
		limit: vi.fn().mockResolvedValue(rows),
		min: vi.fn(),
		orderBy: vi.fn(),
		select: vi.fn(),
		sum: vi.fn(),
		where: vi.fn(),
		whereIn: vi.fn(),
		whereNotNull: vi.fn(),
	};
	for (const method of [
		"alias",
		"andWhere",
		"groupBy",
		"join",
		"min",
		"orderBy",
		"select",
		"sum",
		"where",
		"whereIn",
		"whereNotNull",
	]) {
		query[method].mockReturnValue(query);
	}
	return query;
};

const createProxyHostQuery = (rows) => {
	const query = {
		alias: vi.fn(),
		groupBy: vi.fn(),
		join: vi.fn(),
		select: vi.fn(),
		where: vi.fn(),
		whereIn: vi.fn(),
		withGraphFetched: vi.fn().mockResolvedValue(rows),
	};
	query.alias.mockReturnValue(query);
	query.groupBy.mockReturnValue(query);
	query.join.mockReturnValue(query);
	query.select.mockReturnValue(query);
	query.where.mockReturnValue(query);
	query.whereIn.mockReturnValue(query);
	return query;
};

describe("analytics top-hosts route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("requires analytics:list before serving the aggregate", async () => {
		const access = { can: vi.fn().mockResolvedValue({ permission_analytics: "view" }) };
		const next = vi.fn();

		await mocks.middlewares[1]({}, { locals: { access } }, next);

		expect(access.can).toHaveBeenCalledWith("analytics:list");
		expect(next).toHaveBeenCalledOnce();
	});

	it("returns the five most requested active proxy hosts with domains for the default 24-hour window", async () => {
		const query = createTopHostsQuery([
			{ client_errors: "5", id: "7", requests: "42", server_errors: "2" },
			{ client_errors: "4", id: "3", requests: "8", server_errors: "1" },
		]);
		const hostRows = [
			{ domain_names: ["api.example"], id: 7 },
			{ domain_names: ["app.example"], id: 3 },
		];
		const proxyHostQuery = createProxyHostQuery(hostRows);
		const hostsWithDomainsQuery = createProxyHostQuery(hostRows);
		const response = createResponse();
		mocks.analyticCountQuery.mockReturnValue(query);
		mocks.proxyHostQuery.mockReturnValueOnce(hostsWithDomainsQuery).mockReturnValueOnce(proxyHostQuery);

		await mocks.routes.get("/top-hosts")({ query: {} }, response);

		expect(response.json).toHaveBeenCalledWith([
			{ client_errors: 5, domain_name: "api.example", id: 7, requests: 42, server_errors: 2 },
			{ client_errors: 4, domain_name: "app.example", id: 3, requests: 8, server_errors: 1 },
		]);
		expect(query.alias).toHaveBeenCalledWith("analytic_count");
		expect(query.whereNotNull).toHaveBeenCalledWith("analytic_count.proxy_host_id");
		expect(query.whereIn).toHaveBeenCalledWith("analytic_count.proxy_host_id", hostsWithDomainsQuery);
		expect(query.groupBy).toHaveBeenCalledWith("analytic_count.proxy_host_id");
		expect(query.orderBy).toHaveBeenCalledWith("requests", "desc");
		expect(query.sum).toHaveBeenCalledWith("analytic_count.status_code_5xx as server_errors");
		expect(query.limit).toHaveBeenCalledWith(5);
		expect(hostsWithDomainsQuery.alias).toHaveBeenCalledWith("proxy_host");
		expect(hostsWithDomainsQuery.join).toHaveBeenCalledWith(
			"host_domain",
			"host_domain.proxy_host_id",
			"proxy_host.id",
		);
		expect(hostsWithDomainsQuery.where).toHaveBeenCalledWith("proxy_host.is_deleted", 0);
		expect(hostsWithDomainsQuery.groupBy).toHaveBeenCalledWith("proxy_host.id");
		expect(proxyHostQuery.whereIn).toHaveBeenCalledWith("id", [7, 3]);
		expect(proxyHostQuery.where).toHaveBeenCalledWith("is_deleted", 0);
		expect(proxyHostQuery.withGraphFetched).toHaveBeenCalledWith("host_domains");
	});

	it("returns the five active proxy hosts with the most server errors when sort=server_errors", async () => {
		const query = createTopHostsQuery([
			{ client_errors: "4", id: "3", requests: "8", server_errors: "6" },
			{ client_errors: "5", id: "7", requests: "42", server_errors: "2" },
		]);
		const hostRows = [
			{ domain_names: ["api.example"], id: 7 },
			{ domain_names: ["app.example"], id: 3 },
		];
		const proxyHostQuery = createProxyHostQuery(hostRows);
		const hostsWithDomainsQuery = createProxyHostQuery(hostRows);
		const response = createResponse();
		mocks.analyticCountQuery.mockReturnValue(query);
		mocks.proxyHostQuery.mockReturnValueOnce(hostsWithDomainsQuery).mockReturnValueOnce(proxyHostQuery);

		await mocks.routes.get("/top-hosts")({ query: { sort: "server_errors" } }, response);

		expect(response.json).toHaveBeenCalledWith([
			{ client_errors: 4, domain_name: "app.example", id: 3, requests: 8, server_errors: 6 },
			{ client_errors: 5, domain_name: "api.example", id: 7, requests: 42, server_errors: 2 },
		]);
		expect(query.orderBy).toHaveBeenCalledWith("server_errors", "desc");
		expect(query.sum).toHaveBeenCalledWith("analytic_count.status_code_5xx as server_errors");
	});

	it("returns the five active proxy hosts with the most client errors when sort=client_errors", async () => {
		const query = createTopHostsQuery([
			{ client_errors: "12", id: "3", requests: "8", server_errors: "6" },
			{ client_errors: "4", id: "7", requests: "42", server_errors: "2" },
		]);
		const hostRows = [
			{ domain_names: ["api.example"], id: 7 },
			{ domain_names: ["app.example"], id: 3 },
		];
		const proxyHostQuery = createProxyHostQuery(hostRows);
		const hostsWithDomainsQuery = createProxyHostQuery(hostRows);
		const response = createResponse();
		mocks.analyticCountQuery.mockReturnValue(query);
		mocks.proxyHostQuery.mockReturnValueOnce(hostsWithDomainsQuery).mockReturnValueOnce(proxyHostQuery);

		await mocks.routes.get("/top-hosts")({ query: { sort: "client_errors" } }, response);

		expect(response.json).toHaveBeenCalledWith([
			{ client_errors: 12, domain_name: "app.example", id: 3, requests: 8, server_errors: 6 },
			{ client_errors: 4, domain_name: "api.example", id: 7, requests: 42, server_errors: 2 },
		]);
		expect(query.orderBy).toHaveBeenCalledWith("client_errors", "desc");
		expect(query.sum).toHaveBeenCalledWith("analytic_count.status_code_4xx as client_errors");
	});
});
