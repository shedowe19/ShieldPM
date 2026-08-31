import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	addAuditLog: vi.fn(),
	cloudQueries: [],
	cloudflaredQuery: vi.fn(),
	createTorService: vi.fn(),
	deleteCloudTunnel: vi.fn(),
	deleteTorService: vi.fn(),
	getProxyHost: vi.fn(),
	patchCloudTunnel: vi.fn(),
	patchTorService: vi.fn(),
	restartCloudTunnel: vi.fn(),
	restartTorService: vi.fn(),
	startCloudTunnel: vi.fn(),
	startTorService: vi.fn(),
	stopCloudTunnel: vi.fn(),
	stopTorService: vi.fn(),
	torQueries: [],
	torOnionQuery: vi.fn(),
}));

vi.mock("../../internal/audit-log.js", () => ({ default: { add: mocks.addAuditLog } }));
vi.mock("../../internal/cloudflared.js", () => ({
	default: {
		restart: mocks.restartCloudTunnel,
		start: mocks.startCloudTunnel,
		stop: mocks.stopCloudTunnel,
	},
}));
vi.mock("../../internal/tor.js", () => ({
	default: {
		create: mocks.createTorService,
		restart: mocks.restartTorService,
		start: mocks.startTorService,
		stop: mocks.stopTorService,
	},
}));
vi.mock("../../lib/config.js", () => ({
	getEncryptionKey: vi.fn().mockReturnValue("0".repeat(64)),
	getPrivateKey: vi.fn().mockReturnValue("test-confirmation-key"),
	isDemoMode: vi.fn().mockReturnValue(false),
}));
vi.mock("../../models/cloudflared_tunnel.js", () => ({ default: { query: mocks.cloudflaredQuery } }));
vi.mock("../../models/tor_onion.js", () => ({ default: { query: mocks.torOnionQuery } }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../internal/access-list.js", () => ({ default: {} }));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/ddns-provider.js", () => ({ default: {} }));
vi.mock("../../internal/dead-host.js", () => ({ default: {} }));
vi.mock("../../internal/ip_ranges.js", () => ({ default: {} }));
vi.mock("../../internal/maintenance.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../internal/pki.js", () => ({ default: {} }));
vi.mock("../../internal/proxy-host.js", () => ({ default: { get: mocks.getProxyHost } }));
vi.mock("../../internal/redirection-host.js", () => ({ default: {} }));
vi.mock("../../internal/report.js", () => ({ default: {} }));
vi.mock("../../internal/setting.js", () => ({ default: {} }));
vi.mock("../../internal/stream.js", () => ({ default: {} }));
vi.mock("../../internal/token.js", () => ({ default: {} }));
vi.mock("../../internal/user.js", () => ({ default: {} }));

import { executeTools } from "../../internal/ai/executor.js";
import { getToolEffect, issueConfirmation } from "../../internal/ai/safety.js";
import { getToolDefinitions } from "../../internal/ai/tools.js";

const cloudflaredToolNames = [
	"get_cloudflared_tunnels",
	"create_cloudflared_tunnel",
	"update_cloudflared_tunnel",
	"delete_cloudflared_tunnel",
];
const torToolNames = [
	"get_tor_onion_services",
	"create_tor_onion_service",
	"update_tor_onion_service",
	"delete_tor_onion_service",
	"start_tor_onion_service",
	"stop_tor_onion_service",
];

const attachQuery = (record, records, patchMock, deleteMock) => {
	record.$query = () => ({
		delete: async () => {
			deleteMock(record.id);
			const index = records.indexOf(record);
			if (index !== -1) records.splice(index, 1);
		},
		patch: async (data) => {
			patchMock(record.id, data);
			Object.assign(record, data);
			return record;
		},
		patchAndFetch: async (data) => {
			patchMock(record.id, data);
			Object.assign(record, data);
			return record;
		},
	});
	return record;
};

const createCollectionQuery = (records, queries, insertId, patchMock, deleteMock) => {
	const filters = [];
	const query = Promise.resolve().then(() =>
		records.filter((record) => filters.every(([field, value]) => record[field] === value)),
	);

	Object.assign(query, {
		andWhere: (field, value) => {
			filters.push([field, value]);
			return query;
		},
		deleteById: async (id) => {
			deleteMock(id);
			const index = records.findIndex((record) => record.id === id);
			if (index !== -1) records.splice(index, 1);
		},
		findById: async (id) => records.find((record) => record.id === id),
		first: async () => records.find((record) => filters.every(([field, value]) => record[field] === value)),
		insert: async (data) => {
			const record = attachQuery({ id: insertId, is_deleted: 0, ...data }, records, patchMock, deleteMock);
			records.push(record);
			return record;
		},
		orderBy: () => query,
		patchAndFetchById: async (id, data) => {
			patchMock(id, data);
			const record = records.find((item) => item.id === id);
			if (record) Object.assign(record, data);
			return record;
		},
		where: (field, value) => {
			filters.push([field, value]);
			return query;
		},
	});

	queries.push(query);
	return query;
};

const tunnelCalls = [
	{ name: "get_cloudflared_tunnels", args: {} },
	{ name: "create_cloudflared_tunnel", args: { name: "new-tunnel", token: "token" } },
	{ name: "update_cloudflared_tunnel", args: { id: 1, name: "updated-tunnel" } },
	{ name: "delete_cloudflared_tunnel", args: { id: 1 } },
	{ name: "get_tor_onion_services", args: {} },
	{ name: "create_tor_onion_service", args: { name: "new-onion", virtual_port: 80, target_port: 8080 } },
	{ name: "update_tor_onion_service", args: { id: 11, name: "updated-onion" } },
	{ name: "delete_tor_onion_service", args: { id: 11 } },
	{ name: "start_tor_onion_service", args: { id: 11 } },
	{ name: "stop_tor_onion_service", args: { id: 11 } },
];

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

describe("AI tunnel tool permissions", () => {
	let cloudTunnels;
	let torServices;

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.cloudQueries.length = 0;
		mocks.torQueries.length = 0;
		cloudTunnels = [
			attachQuery(
				{ id: 1, is_deleted: 0, name: "owner-cloud", owner_user_id: 7, status: 0 },
				[],
				mocks.patchCloudTunnel,
				mocks.deleteCloudTunnel,
			),
			attachQuery(
				{ id: 2, is_deleted: 0, name: "foreign-cloud", owner_user_id: 8, status: 0 },
				[],
				mocks.patchCloudTunnel,
				mocks.deleteCloudTunnel,
			),
		];
		torServices = [
			attachQuery(
				{ id: 11, is_deleted: 0, name: "owner-onion", owner_user_id: 7, private_key: "key", status: 0 },
				[],
				mocks.patchTorService,
				mocks.deleteTorService,
			),
			attachQuery(
				{ id: 12, is_deleted: 0, name: "foreign-onion", owner_user_id: 8, private_key: "key", status: 0 },
				[],
				mocks.patchTorService,
				mocks.deleteTorService,
			),
		];

		for (const tunnel of cloudTunnels)
			attachQuery(tunnel, cloudTunnels, mocks.patchCloudTunnel, mocks.deleteCloudTunnel);
		for (const service of torServices)
			attachQuery(service, torServices, mocks.patchTorService, mocks.deleteTorService);

		mocks.cloudflaredQuery.mockImplementation(() =>
			createCollectionQuery(
				cloudTunnels,
				mocks.cloudQueries,
				21,
				mocks.patchCloudTunnel,
				mocks.deleteCloudTunnel,
			),
		);
		mocks.torOnionQuery.mockImplementation(() =>
			createCollectionQuery(torServices, mocks.torQueries, 21, mocks.patchTorService, mocks.deleteTorService),
		);
		mocks.addAuditLog.mockResolvedValue();
		mocks.createTorService.mockResolvedValue();
		mocks.restartCloudTunnel.mockResolvedValue();
		mocks.restartTorService.mockResolvedValue();
		mocks.startCloudTunnel.mockResolvedValue();
		mocks.startTorService.mockResolvedValue();
		mocks.stopCloudTunnel.mockResolvedValue();
		mocks.stopTorService.mockResolvedValue();
	});

	afterAll(() => {
		consoleErrorSpy.mockRestore();
	});

	it("does not advertise Cloudflared or Tor tools when their capabilities are unavailable", async () => {
		const access = { can: vi.fn().mockRejectedValue(new Error("Permission Denied")) };

		const toolNames = (await getToolDefinitions(access)).map((tool) => tool.function.name);

		expect(toolNames).not.toEqual(expect.arrayContaining([...cloudflaredToolNames, ...torToolNames]));
	});

	it("never advertises tunnel mutations that would disclose provider tokens", async () => {
		const access = { can: vi.fn().mockResolvedValue(true) };
		const toolNames = (await getToolDefinitions(access)).map((tool) => tool.function.name);
		expect(toolNames).not.toContain("create_cloudflared_tunnel");
		expect(toolNames).not.toContain("update_cloudflared_tunnel");
	});

	it("rejects every Cloudflared and Tor operation before querying models when capability checks fail", async () => {
		const access = {
			can: vi.fn().mockRejectedValue(new Error("Permission Denied")),
			token: { getUserId: vi.fn().mockReturnValue(7) },
		};

		const results = [];
		for (const call of tunnelCalls) {
			const confirmationToken =
				getToolEffect(call.name) === "destructive"
					? issueConfirmation(access, call.name, call.args)
					: undefined;
			results.push(...(await executeTools(access, [call], { confirmationToken })));
		}

		expect(results.map((result) => result.result)).toEqual(
			tunnelCalls.map((call) =>
				["create_cloudflared_tunnel", "update_cloudflared_tunnel"].includes(call.name)
					? `Error: Unknown or unauthorized AI tool: ${call.name}`
					: "Error: Permission Denied",
			),
		);
		expect(mocks.cloudflaredQuery).not.toHaveBeenCalled();
		expect(mocks.torOnionQuery).not.toHaveBeenCalled();
		expect(mocks.addAuditLog).not.toHaveBeenCalled();
		expect(mocks.createTorService).not.toHaveBeenCalled();
		expect(mocks.startTorService).not.toHaveBeenCalled();
		expect(mocks.stopTorService).not.toHaveBeenCalled();
	});

	it("limits tunnel reads and mutations to the caller's owned records", async () => {
		const access = {
			can: vi.fn().mockResolvedValue({ permission_visibility: "user" }),
			token: { getUserId: vi.fn().mockReturnValue(7) },
		};

		const results = await executeTools(access, [
			{ name: "get_cloudflared_tunnels", args: {} },
			{ name: "get_tor_onion_services", args: {} },
			{ name: "update_cloudflared_tunnel", args: { id: 2, name: "takeover" } },
			{ name: "start_tor_onion_service", args: { id: 12 } },
		]);
		const foreignStart = await executeTools(access, [{ name: "start_tor_onion_service", args: { id: 12 } }]);

		expect(results.map((result) => result.result)).toEqual([
			JSON.stringify([{ id: 1, name: "owner-cloud", status: 0, created_on: undefined }]),
			JSON.stringify([{ id: 11, name: "owner-onion", onion: undefined, status: 0 }]),
			"Error: Unknown or unauthorized AI tool: update_cloudflared_tunnel",
			"Error: Mutation blocked after an untrusted read; start a new user turn",
		]);
		expect(foreignStart.map((result) => result.result)).toEqual(["Error: Not Found - 12"]);
		expect(mocks.patchCloudTunnel).not.toHaveBeenCalled();
		expect(mocks.startTorService).not.toHaveBeenCalled();
		expect(mocks.addAuditLog).not.toHaveBeenCalled();
	});

	it("verifies ownership of a Tor service's linked Proxy Host before creating or updating it", async () => {
		const access = {
			can: vi.fn().mockResolvedValue({ permission_visibility: "user" }),
			token: { getUserId: vi.fn().mockReturnValue(7) },
		};
		mocks.getProxyHost.mockRejectedValue(new Error("Not Found - 99"));

		const createResults = await executeTools(access, [
			{
				name: "create_tor_onion_service",
				args: { name: "foreign-host-onion", proxy_host_id: 99, virtual_port: 80, target_port: 8080 },
			},
		]);
		const updateArgs = { id: 11, proxy_host_id: 99 };
		const updateResults = await executeTools(access, [{ name: "update_tor_onion_service", args: updateArgs }], {
			confirmationToken: issueConfirmation(access, "update_tor_onion_service", updateArgs),
		});
		const results = [...createResults, ...updateResults];

		expect(results.map((result) => result.result)).toEqual(["Error: Not Found - 99", "Error: Not Found - 99"]);
		expect(mocks.torOnionQuery).toHaveBeenCalledOnce();
		expect(mocks.createTorService).not.toHaveBeenCalled();
		expect(mocks.patchTorService).not.toHaveBeenCalled();
		expect(mocks.addAuditLog).not.toHaveBeenCalled();
	});

	it("keeps authorized administrator tunnel operations and audit logging available", async () => {
		const access = {
			can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
			token: { getUserId: vi.fn().mockReturnValue(7) },
		};

		const calls = [
			{ name: "create_cloudflared_tunnel", args: { name: "new-cloud", token: "token" } },
			{ name: "update_cloudflared_tunnel", args: { id: 1, name: "updated-cloud" } },
			{ name: "delete_cloudflared_tunnel", args: { id: 2 } },
			{ name: "create_tor_onion_service", args: { name: "new-onion", virtual_port: 80, target_port: 8080 } },
			{ name: "update_tor_onion_service", args: { id: 11, name: "updated-onion", virtual_port: 443 } },
			{ name: "delete_tor_onion_service", args: { id: 12 } },
		];
		const results = [];
		for (const call of calls) {
			const confirmationToken =
				getToolEffect(call.name) === "destructive"
					? issueConfirmation(access, call.name, call.args)
					: undefined;
			results.push(...(await executeTools(access, [call], { confirmationToken })));
		}

		expect(results.map((result) => result.result)).toEqual([
			"Error: Unknown or unauthorized AI tool: create_cloudflared_tunnel",
			"Error: Unknown or unauthorized AI tool: update_cloudflared_tunnel",
			"Deleted Tunnel ID: 2",
			"Created Tor Onion Service ID: 21 (Address: undefined)",
			"Updated Tor Onion Service ID: 11",
			"Deleted Tor Onion Service ID: 12",
		]);
		expect(mocks.startCloudTunnel).not.toHaveBeenCalled();
		expect(mocks.restartCloudTunnel).not.toHaveBeenCalled();
		expect(mocks.stopCloudTunnel).toHaveBeenCalledWith(2);
		expect(mocks.createTorService).toHaveBeenCalledOnce();
		expect(mocks.restartTorService).toHaveBeenCalledOnce();
		expect(mocks.stopTorService).toHaveBeenCalledWith(expect.objectContaining({ id: 12 }));
		expect(mocks.addAuditLog).toHaveBeenCalledTimes(4);
	});
});
