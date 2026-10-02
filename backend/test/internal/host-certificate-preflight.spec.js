import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	proxyQuery: vi.fn(),
	redirectQuery: vi.fn(),
	deadQuery: vi.fn(),
	streamQuery: vi.fn(),
	prepareQuickCertificate: vi.fn(),
	createQuickCertificate: vi.fn(),
	configure: vi.fn(),
}));

vi.mock("../../models/proxy_host.js", () => ({
	default: { query: mocks.proxyQuery, transaction: (callback) => callback({}) },
}));
vi.mock("../../models/redirection_host.js", () => ({ default: { query: mocks.redirectQuery } }));
vi.mock("../../models/dead_host.js", () => ({ default: { query: mocks.deadQuery } }));
vi.mock("../../models/stream.js", () => ({ default: { query: mocks.streamQuery } }));
vi.mock("../../models/access_list.js", () => ({ default: {} }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/nginx.js", () => ({ default: { configure: mocks.configure } }));
vi.mock("../../internal/certificate.js", () => ({
	default: {
		prepareQuickCertificate: mocks.prepareQuickCertificate,
		createQuickCertificate: mocks.createQuickCertificate,
		get: vi.fn().mockResolvedValue({ id: 8 }),
	},
}));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: vi.fn() } }));
vi.mock("../../internal/git-deploy.js", () => ({ default: { startPollingForHost: vi.fn() } }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: {} }));
vi.mock("../../internal/proxy-host-monitor.js", () => ({ default: { resetHost: vi.fn(), removeHost: vi.fn() } }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: (value) => `encrypted:${value}` }));
vi.mock("../../lib/config.js", () => ({ isPostgres: () => false }));

import internalDeadHost from "../../internal/dead-host.js";
import internalHost from "../../internal/host.js";
import internalProxyHost from "../../internal/proxy-host.js";
import internalRedirectionHost from "../../internal/redirection-host.js";
import internalStream from "../../internal/stream.js";
import errs from "../../lib/error.js";

const hostCases = [
	{
		name: "proxy host",
		service: internalProxyHost,
		query: mocks.proxyQuery,
		fields: { forward_scheme: "http", forward_host: "upstream.test", forward_port: 8080, access_list_id: 0 },
	},
	{
		name: "redirection host",
		service: internalRedirectionHost,
		query: mocks.redirectQuery,
		fields: { forward_scheme: "https", forward_domain_name: "target.test", forward_http_code: 301 },
	},
	{ name: "dead host", service: internalDeadHost, query: mocks.deadQuery, fields: {} },
	{
		name: "stream",
		service: internalStream,
		query: mocks.streamQuery,
		fields: { incoming_port: "8443", tcp_forwarding: true, udp_forwarding: false },
	},
];

const access = () => ({
	can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
	token: { getUserId: () => 1 },
});

const createStore = (source, queryMock) => {
	const state = { row: structuredClone(source), writes: [] };
	const save = (data, operation) => {
		state.writes.push({ operation, data: structuredClone(data) });
		Object.assign(state.row, structuredClone(data));
		return structuredClone(state.row);
	};
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
				Promise.resolve(collision ? [] : structuredClone(state.row)).then(resolve, reject),
			insertAndFetch: vi.fn().mockImplementation(async (data) => save(data, "insert")),
			insertGraphAndFetch: vi.fn().mockImplementation(async (data) => save(data, "insert")),
			patch: vi.fn().mockImplementation(async (data) => {
				save(data, "patch");
				return 1;
			}),
			patchAndFetchById: vi.fn().mockImplementation(async (_id, data) => save(data, "patch")),
			upsertGraphAndFetch: vi.fn().mockImplementation(async (data) => save(data, "patch")),
		};
		return query;
	});
	return state;
};

const savedRow = (fields, domains = ["tls.preflight.test"]) => ({
	...fields,
	id: 5,
	domain_names: domains,
	certificate_id: 0,
	meta: { existing_meta: "retained" },
});

describe("inline certificate preflight", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(internalHost, "isHostnameTaken").mockImplementation(async (hostname) => ({
			hostname,
			is_taken: false,
		}));
		mocks.configure.mockResolvedValue({ nginx_online: true, nginx_err: null });
		mocks.createQuickCertificate.mockResolvedValue({ id: 8 });
		mocks.prepareQuickCertificate.mockImplementation(async (_access, data) => ({
			...structuredClone(data),
			meta: { ...data.meta, letsencrypt_profile: data.meta?.letsencrypt_profile || "shortlived" },
		}));
	});

	describe.each(hostCases)("$name", ({ service, query, fields }) => {
		it.each(["create", "update"])(
			"awaits preflight before any %s write and leaves rejected input intact",
			async (method) => {
				const state = createStore(savedRow(fields), query);
				const domains = Array.from({ length: 26 }, (_, index) => `host-${index}.preflight.test`);
				const request = {
					...fields,
					...(method === "update" ? { id: 5 } : {}),
					domain_names: domains,
					certificate_id: "new",
					meta: { dns_challenge: true },
				};
				const original = structuredClone(request);
				const actor = access();
				let rejectPreparation;
				mocks.prepareQuickCertificate.mockImplementation(
					() =>
						new Promise((_resolve, reject) => {
							rejectPreparation = reject;
						}),
				);

				const operation = service[method](actor, request);
				const rejection = expect(operation).rejects.toThrow("Shortlived certificates support at most 25 names");
				await vi.waitFor(() => expect(mocks.prepareQuickCertificate).toHaveBeenCalledOnce());
				expect(mocks.prepareQuickCertificate).toHaveBeenCalledWith(
					actor,
					expect.objectContaining({
						domain_names: domains,
						meta: expect.not.objectContaining({ letsencrypt_profile: expect.anything() }),
					}),
				);
				expect(state.writes).toEqual([]);
				expect(mocks.createQuickCertificate).not.toHaveBeenCalled();
				expect(mocks.configure).not.toHaveBeenCalled();
				expect(request).toEqual(original);

				rejectPreparation(new errs.ValidationError("Shortlived certificates support at most 25 names"));
				await rejection;
				expect(state.writes).toEqual([]);
				expect(request).toEqual(original);
			},
		);

		it.each(["create", "update"])(
			"forwards the resolved profile and DNS credentials when %s succeeds",
			async (method) => {
				const state = createStore(savedRow(fields), query);
				const request = {
					...fields,
					...(method === "update" ? { id: 5 } : {}),
					domain_names: ["tls.preflight.test"],
					certificate_id: "new",
					meta: {
						dns_challenge: true,
						dns_provider: "cloudflare",
						dns_provider_credentials: "synthetic-test-credentials",
					},
				};
				const original = structuredClone(request);
				const actor = access();

				await service[method](actor, request);

				expect(mocks.prepareQuickCertificate).toHaveBeenCalledOnce();
				expect(mocks.createQuickCertificate).toHaveBeenCalledOnce();
				expect(mocks.createQuickCertificate).toHaveBeenCalledWith(
					actor,
					expect.objectContaining({
						domain_names: original.domain_names,
						meta: expect.objectContaining({ ...original.meta, letsencrypt_profile: "shortlived" }),
					}),
				);
				if (method === "update") {
					expect(mocks.prepareQuickCertificate.mock.calls[0][1].meta.existing_meta).toBe("retained");
				}
				expect(state.row.certificate_id).toBe(8);
				expect(state.writes.length).toBeGreaterThan(0);
				expect(
					state.writes.every((write) => !Object.hasOwn(write.data.meta || {}, "dns_provider_credentials")),
				).toBe(true);
				expect(request).toEqual(original);
			},
		);

		it.each([undefined, "standard"])(
			"uses the requested profile %j instead of a previous host profile",
			async (profile) => {
				const previous = savedRow(fields);
				previous.meta.letsencrypt_profile = "shortlived";
				createStore(previous, query);
				const request = {
					id: 5,
					certificate_id: "new",
					domain_names: ["tls.preflight.test"],
					...(profile ? { meta: { letsencrypt_profile: profile } } : {}),
				};
				const original = structuredClone(request);

				await service.update(access(), request);

				const preparedMeta = mocks.prepareQuickCertificate.mock.calls[0][1].meta;
				if (profile) {
					expect(preparedMeta.letsencrypt_profile).toBe(profile);
				} else {
					expect(preparedMeta).not.toHaveProperty("letsencrypt_profile");
				}
				expect(mocks.createQuickCertificate.mock.calls[0][1].meta.letsencrypt_profile).toBe(
					profile || "shortlived",
				);
				expect(request).toEqual(original);
			},
		);
	});

	it.each(hostCases.filter(({ name }) => name !== "stream"))(
		"preflights saved domains for a certificate-only $name update before patching",
		async ({ service, query, fields }) => {
			const domains = Array.from({ length: 26 }, (_, index) => `saved-${index}.preflight.test`);
			const state = createStore(savedRow(fields, domains), query);
			const request = { id: 5, certificate_id: "new" };
			mocks.prepareQuickCertificate.mockRejectedValue(new errs.ValidationError("Too many names for Shortlived"));

			await expect(service.update(access(), request)).rejects.toThrow("Too many names for Shortlived");

			expect(mocks.prepareQuickCertificate.mock.calls[0][1].domain_names).toEqual(domains);
			expect(state.writes).toEqual([]);
			expect(mocks.createQuickCertificate).not.toHaveBeenCalled();
			expect(request).toEqual({ id: 5, certificate_id: "new" });
		},
	);
});
