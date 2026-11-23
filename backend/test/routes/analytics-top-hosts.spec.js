import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	analyticCountKnex: vi.fn(),
	analyticCountQuery: vi.fn(),
	analyticsLogsQuery: vi.fn(),
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
vi.mock("../../models/analytic_count.js", () => ({
	default: { knex: mocks.analyticCountKnex, query: mocks.analyticCountQuery },
}));
vi.mock("../../models/analytics_logs.js", () => ({ default: { query: mocks.analyticsLogsQuery } }));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: mocks.proxyHostQuery } }));

import "../../routes/analytics.js";

const createResponse = (permission = { roles: ["admin"] }) => ({
	json: vi.fn(),
	locals: { access: createAccess(permission), analyticsPermission: permission },
	set: vi.fn(),
	status: vi.fn().mockReturnThis(),
});

const createAccess = (permission = { roles: ["admin"] }) => ({
	can: vi.fn().mockResolvedValue(permission),
	token: { getUserId: () => 1 },
});

const createTopHostsQuery = (rows) => {
	const query = {
		alias: vi.fn(),
		andWhere: vi.fn(),
		avg: vi.fn(),
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
		"avg",
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
		andWhere: vi.fn(),
		groupBy: vi.fn(),
		join: vi.fn(),
		select: vi.fn(),
		where: vi.fn(),
		whereIn: vi.fn(),
		withGraphFetched: vi.fn().mockResolvedValue(rows),
	};
	query.alias.mockReturnValue(query);
	query.andWhere.mockReturnValue(query);
	query.groupBy.mockReturnValue(query);
	query.join.mockReturnValue(query);
	query.select.mockReturnValue(query);
	query.where.mockReturnValue(query);
	query.whereIn.mockReturnValue(query);
	return query;
};

const createSeriesQuery = (rows) => {
	const query = {
		andWhere: vi.fn(() => query),
		orderBy: vi.fn().mockResolvedValue(rows),
		where: vi.fn(() => query),
		whereIn: vi.fn(() => query),
		whereNotNull: vi.fn(() => query),
	};
	return query;
};

const createSummaryBuilder = (result) => {
	const builder = {
		andWhere: vi.fn(() => builder),
		first: vi.fn().mockResolvedValue(result),
		from: vi.fn(() => builder),
		sum: vi.fn(() => builder),
		where: vi.fn(() => builder),
		whereIn: vi.fn(() => builder),
		whereNotNull: vi.fn(() => builder),
		whereNull: vi.fn(() => builder),
	};
	return builder;
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
			{ bytes: "1024", client_errors: "5", id: "7", requests: "42", server_errors: "2" },
			{ bytes: "512", client_errors: "4", id: "3", requests: "8", server_errors: "1" },
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
			{ bytes: 1024, client_errors: 5, domain_name: "api.example", id: 7, requests: 42, server_errors: 2 },
			{ bytes: 512, client_errors: 4, domain_name: "app.example", id: 3, requests: 8, server_errors: 1 },
		]);
		expect(query.alias).toHaveBeenCalledWith("analytic_count");
		expect(query.whereNotNull).toHaveBeenCalledWith("analytic_count.proxy_host_id");
		expect(query.whereIn).toHaveBeenCalledWith("analytic_count.proxy_host_id", hostsWithDomainsQuery);
		expect(query.groupBy).toHaveBeenCalledWith("analytic_count.proxy_host_id");
		expect(query.orderBy).toHaveBeenCalledWith("requests", "desc");
		expect(query.sum).toHaveBeenCalledWith("analytic_count.bytes_sent as bytes");
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

	it("returns the five active proxy hosts with the most transferred bytes when sort=bytes", async () => {
		const query = createTopHostsQuery([
			{ bytes: "4096", client_errors: "4", id: "3", requests: "8", server_errors: "6" },
			{ bytes: "1024", client_errors: "5", id: "7", requests: "42", server_errors: "2" },
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

		await mocks.routes.get("/top-hosts")({ query: { sort: "bytes" } }, response);

		expect(response.json).toHaveBeenCalledWith([
			{ bytes: 4096, client_errors: 4, domain_name: "app.example", id: 3, requests: 8, server_errors: 6 },
			{ bytes: 1024, client_errors: 5, domain_name: "api.example", id: 7, requests: 42, server_errors: 2 },
		]);
		expect(query.orderBy).toHaveBeenCalledWith("bytes", "desc");
		expect(query.sum).toHaveBeenCalledWith("analytic_count.bytes_sent as bytes");
	});

	it("returns the five active proxy hosts with the most server errors when sort=server_errors", async () => {
		const query = createTopHostsQuery([
			{ bytes: "800", client_errors: "4", id: "3", requests: "8", server_errors: "6" },
			{ bytes: "400", client_errors: "5", id: "7", requests: "42", server_errors: "2" },
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
			{ bytes: 800, client_errors: 4, domain_name: "app.example", id: 3, requests: 8, server_errors: 6 },
			{ bytes: 400, client_errors: 5, domain_name: "api.example", id: 7, requests: 42, server_errors: 2 },
		]);
		expect(query.orderBy).toHaveBeenCalledWith("server_errors", "desc");
		expect(query.sum).toHaveBeenCalledWith("analytic_count.status_code_5xx as server_errors");
	});

	it("returns the five active proxy hosts with the most client errors when sort=client_errors", async () => {
		const query = createTopHostsQuery([
			{ bytes: "512", client_errors: "12", id: "3", requests: "8", server_errors: "6" },
			{ bytes: "256", client_errors: "4", id: "7", requests: "42", server_errors: "2" },
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
			{ bytes: 512, client_errors: 12, domain_name: "app.example", id: 3, requests: 8, server_errors: 6 },
			{ bytes: 256, client_errors: 4, domain_name: "api.example", id: 7, requests: 42, server_errors: 2 },
		]);
		expect(query.orderBy).toHaveBeenCalledWith("client_errors", "desc");
		expect(query.sum).toHaveBeenCalledWith("analytic_count.status_code_4xx as client_errors");
	});

	it("returns the five active proxy hosts with the slowest average response time when sort=response_time", async () => {
		const slowestQuery = createTopHostsQuery([{ average_duration: "1825", id: "3" }]);
		const metricsRows = [{ bytes: "1024", client_errors: "2", id: "3", requests: "42", server_errors: "1" }];
		const metricsQuery = createTopHostsQuery(metricsRows);
		metricsQuery.groupBy.mockResolvedValue(metricsRows);
		const hostRows = [{ domain_names: ["app.example"], id: 3 }];
		const proxyHostQuery = createProxyHostQuery(hostRows);
		const hostsWithDomainsQuery = createProxyHostQuery(hostRows);
		const response = createResponse();
		mocks.analyticCountQuery.mockReturnValue(metricsQuery);
		mocks.analyticsLogsQuery.mockReturnValue(slowestQuery);
		mocks.proxyHostQuery.mockReturnValueOnce(hostsWithDomainsQuery).mockReturnValueOnce(proxyHostQuery);

		await mocks.routes.get("/top-hosts")({ query: { sort: "response_time" } }, response);

		expect(mocks.analyticsLogsQuery).toHaveBeenCalledOnce();
		expect(slowestQuery.alias).toHaveBeenCalledWith("analytics_logs");
		expect(slowestQuery.where).toHaveBeenCalledWith("analytics_logs.duration", ">", 0);
		expect(slowestQuery.avg).toHaveBeenCalledWith("analytics_logs.duration as average_duration");
		expect(slowestQuery.groupBy).toHaveBeenCalledWith("analytics_logs.host_id");
		expect(slowestQuery.orderBy).toHaveBeenCalledWith("average_duration", "desc");
		expect(slowestQuery.limit).toHaveBeenCalledWith(5);
		expect(metricsQuery.whereIn).toHaveBeenCalledWith("analytic_count.proxy_host_id", [3]);
		expect(response.set).toHaveBeenCalledWith("X-Analytics-Detail-Since", expect.any(String));
		expect(response.json).toHaveBeenCalledWith([
			{
				average_duration: 1825,
				bytes: 1024,
				client_errors: 2,
				domain_name: "app.example",
				id: 3,
				requests: 42,
				server_errors: 1,
			},
		]);
	});

	it("filters top-hosts to hosts owned by a normal analytics viewer", async () => {
		const ranking = createTopHostsQuery([
			{ bytes: "100", client_errors: "0", id: "7", requests: "3", server_errors: "0" },
		]);
		const hostRows = [{ domain_names: ["own.example"], id: 7 }];
		const hostsWithDomainsQuery = createProxyHostQuery(hostRows);
		const ownershipQuery = createProxyHostQuery([]);
		const proxyHostQuery = createProxyHostQuery(hostRows);
		const response = createResponse({
			permission_analytics: "view",
			permission_visibility: "user",
			roles: ["user"],
		});
		mocks.analyticCountQuery.mockReturnValue(ranking);
		mocks.proxyHostQuery
			.mockReturnValueOnce(hostsWithDomainsQuery)
			.mockReturnValueOnce(ownershipQuery)
			.mockReturnValueOnce(proxyHostQuery);

		await mocks.routes.get("/top-hosts")({ query: {} }, response);

		expect(hostsWithDomainsQuery.whereIn).toHaveBeenCalledWith("proxy_host.id", ownershipQuery);
		expect(ownershipQuery.where).toHaveBeenCalledWith("is_deleted", 0);
		expect(ownershipQuery.andWhere).toHaveBeenCalledWith("owner_user_id", 1);
		expect(ownershipQuery.select).toHaveBeenCalledWith("id");
		expect(proxyHostQuery.andWhere).toHaveBeenCalledWith("owner_user_id", 1);
		expect(response.json).toHaveBeenCalledWith([
			{ bytes: 100, client_errors: 0, domain_name: "own.example", id: 7, requests: 3, server_errors: 0 },
		]);
	});

	it("filters the global time series to owned hosts for a normal analytics viewer", async () => {
		const query = createSeriesQuery([]);
		const ownershipQuery = createProxyHostQuery([]);
		const response = createResponse({
			permission_analytics: "view",
			permission_visibility: "user",
			roles: ["user"],
		});
		mocks.analyticCountQuery.mockReturnValue(query);
		mocks.proxyHostQuery.mockReturnValueOnce(ownershipQuery);

		await mocks.routes.get("/series")({ query: {} }, response);

		expect(query.whereIn).toHaveBeenCalledWith("proxy_host_id", ownershipQuery);
		expect(query.whereNotNull).not.toHaveBeenCalled();
		expect(response.json).toHaveBeenCalledWith([]);
	});

	it("reports the host-0 bucket separately from attributed hosts", async () => {
		const attributed = createSummaryBuilder({ bytes: "1024", count: "10", s2xx: "8" });
		const unattributed = createSummaryBuilder({ bytes: "128", count: "3", s2xx: "1" });
		const knexFunction = { from: vi.fn().mockReturnValueOnce(attributed).mockReturnValueOnce(unattributed) };
		mocks.analyticCountKnex.mockReturnValue(knexFunction);
		const response = createResponse();

		await mocks.routes.get("/summary")({ query: {} }, response);

		expect(attributed.whereNotNull).toHaveBeenCalledWith("proxy_host_id");
		expect(unattributed.whereNull).toHaveBeenCalledWith("proxy_host_id");
		expect(response.json).toHaveBeenCalledWith(
			expect.objectContaining({
				count: 10,
				unattributed: expect.objectContaining({ count: 3 }),
			}),
		);
	});
});
