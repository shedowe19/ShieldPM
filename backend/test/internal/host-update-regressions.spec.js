import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	proxyQuery: vi.fn(),
	streamQuery: vi.fn(),
	deadQuery: vi.fn(),
	redirectQuery: vi.fn(),
	configure: vi.fn(),
	encrypt: vi.fn((value) => `encrypted:${value}`),
}));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: mocks.proxyQuery } }));
vi.mock("../../models/stream.js", () => ({ default: { query: mocks.streamQuery } }));
vi.mock("../../models/dead_host.js", () => ({ default: { query: mocks.deadQuery } }));
vi.mock("../../models/redirection_host.js", () => ({ default: { query: mocks.redirectQuery } }));
vi.mock("../../models/access_list.js", () => ({ default: {} }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/nginx.js", () => ({ default: { configure: mocks.configure } }));
vi.mock("../../internal/certificate.js", () => ({
	default: {
		createQuickCertificate: vi.fn().mockResolvedValue({ id: 8 }),
		get: vi.fn().mockResolvedValue({ id: 8 }),
	},
}));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: vi.fn() } }));
vi.mock("../../internal/git-deploy.js", () => ({ default: { startPollingForHost: vi.fn() } }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: {} }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: mocks.encrypt }));
vi.mock("../../lib/config.js", () => ({ isPostgres: () => false }));

import internalDeadHost from "../../internal/dead-host.js";
import internalProxyHost from "../../internal/proxy-host.js";
import internalStream from "../../internal/stream.js";

const access = () => ({
	can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
	token: { getUserId: () => 1 },
});

const createStore = (source, queryMock) => {
	const state = { row: structuredClone(source), queries: [], patches: [] };
	queryMock.mockImplementation(() => {
		let collision = false;
		const query = {
			where: vi.fn().mockReturnThis(),
			andWhere: vi.fn().mockReturnThis(),
			allowGraph: vi.fn().mockReturnThis(),
			withGraphFetched: vi.fn().mockReturnThis(),
			first: vi.fn().mockReturnThis(),
			select: vi.fn().mockImplementation(() => {
				collision = true;
				return query;
			}),
			// biome-ignore lint/suspicious/noThenProperty: Objection query builders are intentionally thenable.
			then: (resolve, reject) =>
				Promise.resolve(collision ? state.collisionRows || [] : structuredClone(state.row)).then(
					resolve,
					reject,
				),
			patch: vi.fn().mockImplementation(async (data) => {
				state.patches.push(data);
				Object.assign(state.row, data);
				return 1;
			}),
			patchAndFetchById: vi.fn().mockImplementation(async (_id, data) => {
				state.patches.push(data);
				Object.assign(state.row, data);
				return structuredClone(state.row);
			}),
			upsertGraphAndFetch: vi.fn().mockImplementation(async (data) => {
				state.patches.push(data);
				Object.assign(state.row, data);
				return structuredClone(state.row);
			}),
		};
		state.queries.push(query);
		return query;
	});
	return state;
};

describe("host update regressions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.configure.mockResolvedValue({ nginx_online: true, nginx_err: null });
	});

	it("retains managed web roots through updates while masking the response", async () => {
		const state = createStore(
			{
				id: 5,
				domain_names: ["managed.test"],
				forward_scheme: "path",
				forward_host: "/data/websites/host-5",
				access_list_id: 0,
				enabled: true,
				meta: {},
			},
			mocks.proxyQuery,
		);
		const result = await internalProxyHost.update(access(), { id: 5, forward_host: "(managed)", note: "updated" });
		expect(state.row.forward_host).toBe("/data/websites/host-5");
		expect(mocks.configure.mock.calls[0][2].forward_host).toBe("/data/websites/host-5");
		expect(result.forward_host).toBe("(managed)");
		expect(result.meta.nginx_online).toBe(true);
	});

	it("hides managed paths by default and keeps them available only to internal callers", async () => {
		createStore({ id: 5, forward_host: "/data/websites/host-5", meta: {} }, mocks.proxyQuery);
		expect((await internalProxyHost.get(access(), { id: 5 })).forward_host).toBe("(managed)");
		expect((await internalProxyHost.get(access(), { id: 5 }, { preserveManagedPath: true })).forward_host).toBe(
			"/data/websites/host-5",
		);
	});

	it.each([
		[internalProxyHost, mocks.proxyQuery],
		[internalDeadHost, mocks.deadQuery],
		[internalStream, mocks.streamQuery],
	])("removes legacy DNS provider credentials from host responses", async (service, query) => {
		createStore({ id: 5, meta: { nginx_online: true, dns_provider_credentials: "dns-secret" } }, query);
		expect((await service.get(access(), { id: 5 })).meta).toEqual({ nginx_online: true });
	});

	it("uses DNS credentials for issuance without retaining them in the updated stream", async () => {
		const state = createStore(
			{ id: 5, incoming_port: "8443", tcp_forwarding: true, udp_forwarding: false, meta: {} },
			mocks.streamQuery,
		);
		await internalStream.update(access(), {
			id: 5,
			certificate_id: "new",
			domain_names: ["tls.test"],
			meta: { dns_provider_credentials: "dns-secret", dns_challenge: true },
		});
		expect(state.patches[0].meta).toEqual({ dns_challenge: true });
	});

	it("redacts expanded auth secrets and preserves blank terminal credentials on edits", async () => {
		const state = createStore(
			{
				id: 5,
				domain_names: ["terminal.test"],
				forward_scheme: "terminal",
				access_list_id: 0,
				terminal_password: "existing-ciphertext",
				terminal_private_key: "existing-private-key",
				git_credentials: "git-secret",
				access_list: {
					meta: { oidc_client_secret: "oidc-secret", auth_type: "oidc" },
					items: [{ username: "user", password: "hash" }],
				},
				meta: {},
			},
			mocks.proxyQuery,
		);
		const result = await internalProxyHost.update(access(), {
			id: 5,
			terminal_password: "",
			terminal_private_key: "",
		});
		expect(state.row.terminal_password).toBe("existing-ciphertext");
		expect(state.row.terminal_private_key).toBe("existing-private-key");
		expect(result).not.toHaveProperty("terminal_password");
		expect(result).not.toHaveProperty("terminal_private_key");
		expect(result).not.toHaveProperty("git_credentials");
		expect(result.access_list.meta).toEqual({ auth_type: "oidc" });
		expect(result.access_list.items[0]).not.toHaveProperty("password");
		expect(mocks.configure.mock.calls[0][2].access_list.meta.oidc_client_secret).toBe("oidc-secret");
	});

	it("uses saved stream protocol and port for certificate-only updates", async () => {
		const state = createStore(
			{ id: 5, incoming_port: "8443", tcp_forwarding: true, udp_forwarding: false, meta: {} },
			mocks.streamQuery,
		);
		await internalStream.update(access(), { id: 5, certificate_id: 8 });
		const collisionQuery = state.queries.find((query) => query.select.mock.calls.length > 0);
		expect(collisionQuery.select).toHaveBeenCalledWith("id", "incoming_port", "tcp_forwarding", "udp_forwarding");
		expect(state.patches[0]).not.toHaveProperty("domain_names");
		expect(state.patches[0].certificate_id).toBe(8);
	});

	it("does not persist the domains used for a new stream certificate", async () => {
		const state = createStore(
			{ id: 5, incoming_port: "8443", tcp_forwarding: true, udp_forwarding: false, meta: {} },
			mocks.streamQuery,
		);
		await internalStream.update(access(), { id: 5, certificate_id: "new", domain_names: ["tls.test"] });
		expect(state.patches[0]).not.toHaveProperty("domain_names");
		expect(state.patches[0].certificate_id).toBe(8);
	});

	it.each(["9000", "9050", "9100", "8999-9200"])("rejects overlapping TCP listener %s", async (incomingPort) => {
		const state = createStore(
			{ id: 5, incoming_port: "8443", tcp_forwarding: true, udp_forwarding: false, meta: {} },
			mocks.streamQuery,
		);
		state.collisionRows = [{ id: 7, incoming_port: "9000-9100", tcp_forwarding: true, udp_forwarding: false }];
		await expect(internalStream.update(access(), { id: 5, incoming_port: incomingPort })).rejects.toThrow(
			"already in use",
		);
		expect(state.patches).toHaveLength(0);
	});

	it("allows the same listener port when TCP and UDP are separate", async () => {
		const state = createStore(
			{ id: 5, incoming_port: "9050", tcp_forwarding: false, udp_forwarding: true, meta: {} },
			mocks.streamQuery,
		);
		state.collisionRows = [{ id: 7, incoming_port: "9000-9100", tcp_forwarding: true, udp_forwarding: false }];
		await expect(internalStream.update(access(), { id: 5, note: "UDP listener" })).resolves.toBeDefined();
	});

	it.each(["0", "65536", "9100-9000"])(
		"rejects invalid incoming port range %s before saving",
		async (incomingPort) => {
			const state = createStore(
				{ id: 5, incoming_port: "8443", tcp_forwarding: true, udp_forwarding: false, meta: {} },
				mocks.streamQuery,
			);
			await expect(internalStream.update(access(), { id: 5, incoming_port: incomingPort })).rejects.toThrow(
				"1-65535",
			);
			expect(state.patches).toHaveLength(0);
		},
	);

	it("requires certificate domains before creating or updating streams with a new certificate", async () => {
		await expect(internalStream.create(access(), { certificate_id: "new" })).rejects.toThrow(
			"Domain names are required",
		);
		await expect(internalStream.update(access(), { id: 5, certificate_id: "new" })).rejects.toThrow(
			"Domain names are required",
		);
		expect(mocks.streamQuery).not.toHaveBeenCalled();
	});

	it("generates a dead host from its updated row, including the new certificate", async () => {
		createStore({ id: 5, certificate_id: 0, domain_names: ["dead.test"], meta: {} }, mocks.deadQuery);
		const result = await internalDeadHost.update(access(), {
			id: 5,
			certificate_id: 8,
			advanced_config: "return 410;",
		});
		expect(mocks.configure.mock.calls[0][2]).toMatchObject({ certificate_id: 8, advanced_config: "return 410;" });
		expect(result.meta.nginx_online).toBe(true);
	});
});
