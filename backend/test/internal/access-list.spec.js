import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ items: [], clients: [], config: {}, events: [], fail: false, audit: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: async (value) => `$2b$hashed-${value}` } }));
vi.mock("../../models/access_list.js", () => ({
	default: {
		transaction: async (callback) => {
			const snapshot = structuredClone({ items: state.items, clients: state.clients, config: state.config });
			try {
				return await callback({});
			} catch (error) {
				Object.assign(state, snapshot);
				throw error;
			}
		},
		query: () => ({
			where: () => ({ patch: async (data) => Object.assign(state.config, data) }),
			insertAndFetch: async (data) => Object.assign(state.config, data, { id: 1 }),
		}),
	},
}));
vi.mock("../../models/access_list_auth.js", () => ({
	default: {
		query: () => {
			let keep = [];
			const query = {
				delete: () => query,
				where: () => query,
				whereNotIn: (_column, values) => {
					keep = values;
					return query;
				},
				// biome-ignore lint/suspicious/noThenProperty: Objection query builders are intentionally thenable.
				then: (resolve, reject) =>
					Promise.resolve()
						.then(() => {
							state.events.push("delete");
							state.items = state.items.filter((item) => keep.includes(item.username));
						})
						.then(resolve, reject),
				insert: async (item) => {
					await new Promise((resolve) => setTimeout(resolve, 5));
					if (state.fail) throw new Error("Database insert failed");
					state.events.push(`insert:${item.username}`);
					state.items.push(item);
				},
			};
			return query;
		},
	},
}));
vi.mock("../../models/access_list_client.js", () => ({
	default: {
		query: () => ({
			delete: () => ({
				where: async () => {
					state.clients = [];
				},
			}),
			insert: async (client) => state.clients.push(client),
		}),
	},
}));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../models/now_helper.js", () => ({ default: () => "now" }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: state.audit } }));
vi.mock("../../internal/nginx.js", () => ({
	default: { reload: vi.fn(), bulkGenerateConfigs: vi.fn(), withConfigurationLock: (callback) => callback() },
}));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: vi.fn() } }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: { stop: vi.fn(), restart: vi.fn() } }));
vi.mock("../../lib/utils.js", () => ({ default: {} }));
vi.mock("../../logger.js", () => ({ access: { info: vi.fn() } }));

import service from "../../internal/access-list.js";

const access = { can: vi.fn().mockResolvedValue(true), token: { getUserId: () => 1 } };

describe("access list credential updates", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		state.fail = false;
		state.events = [];
		state.items = [
			{ username: "keep", password: "$2b$existing" },
			{ username: "replace", password: "$2b$old" },
			{ username: "remove", password: "$2b$removed" },
		];
		state.clients = [];
		state.config = { name: "Original" };
		state.audit.mockClear();
		vi.spyOn(service, "get").mockImplementation(async () => ({
			id: 1,
			...state.config,
			items: structuredClone(state.items),
			clients: structuredClone(state.clients),
			proxy_host_count: 0,
		}));
		vi.spyOn(service, "build").mockImplementation(async () => {
			state.events.push("build");
		});
	});

	it("creates lists without optional credential entries", async () => {
		state.items = [];
		const result = await service.create(access, {
			name: "Clients only",
			clients: [{ address: "all", directive: "deny" }],
		});
		expect(result.id).toBe(1);
		expect(state.items).toEqual([]);
		expect(state.clients).toEqual([expect.objectContaining({ address: "all", directive: "deny" })]);
	});

	it("rolls back list creation when credential insertion fails", async () => {
		state.fail = true;
		await expect(
			service.create(access, { name: "Failed", items: [{ username: "new", password: "new-password" }] }),
		).rejects.toThrow("Database insert failed");
		expect(state.config.name).toBe("Original");
		expect(service.build).not.toHaveBeenCalled();
	});

	it("hashes passwords that only pretend to be bcrypt hashes", async () => {
		await service.update(access, { id: 1, items: [{ username: "replace", password: "$2malformed" }] });
		expect(state.items[0].password).toBe("$2b$hashed-$2malformed");
	});

	it.each([
		{ authentik_host: "https://auth.test;include /tmp/injected;" },
		{ oauth2_proxy_prefix: "/oauth2/; return 200;" },
		{ oauth2_proxy_prefix: ["/oauth2/"] },
		{ oauth2_allowed_emails: ["user@example.test"] },
	])("rejects malformed SSO metadata before persistence: %j", async (meta) => {
		await expect(service.update(access, { id: 1, meta })).rejects.toMatchObject({ status: 400 });
		expect(service.get).not.toHaveBeenCalled();
	});

	it("loads current domains and certificates before regenerating assigned hosts", async () => {
		await service.update(access, { id: 1, name: "Changed" });
		expect(service.get.mock.calls[1][1].expand).toContain(
			"proxy_hosts.[host_domains,certificate,access_list.[clients,items]]",
		);
	});

	it("preserves unchanged credentials and waits for replacements before rebuilding", async () => {
		await service.update(access, {
			id: 1,
			items: [
				{ username: "keep", password: "" },
				{ username: "replace", password: "new-password" },
				{ username: "new", password: "added-password" },
			],
		});
		expect(state.items).toEqual([
			{ username: "keep", password: "$2b$existing" },
			{ access_list_id: 1, username: "replace", password: "$2b$hashed-new-password" },
			{ access_list_id: 1, username: "new", password: "$2b$hashed-added-password" },
		]);
		expect(state.events).toEqual(["delete", "insert:replace", "insert:new", "build"]);
	});

	it("rolls back credentials and configuration when an insert fails", async () => {
		state.fail = true;
		const original = structuredClone(state.items);
		await expect(
			service.update(access, { id: 1, name: "Changed", items: [{ username: "replace", password: "new" }] }),
		).rejects.toThrow("Database insert failed");
		expect(state.items).toEqual(original);
		expect(state.config.name).toBe("Original");
		expect(service.build).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
	});

	it("updates an mTLS certificate and options without requiring a name change", async () => {
		await service.update(access, {
			id: 1,
			mtls_enabled: true,
			mtls_certificate: "TEST CERTIFICATE",
			satisfy_any: true,
		});
		expect(state.config).toMatchObject({
			name: "Original",
			mtls_enabled: true,
			mtls_certificate: "TEST CERTIFICATE",
			satisfy_any: true,
		});
		expect(service.build).toHaveBeenCalledWith(expect.objectContaining({ mtls_certificate: "TEST CERTIFICATE" }));
	});

	it("replaces IP rules using only editable client fields", async () => {
		await service.update(access, {
			id: 1,
			clients: [{ id: 500, access_list_id: 99, address: "127.0.0.1", directive: "allow" }],
		});
		expect(state.clients).toEqual([{ access_list_id: 1, address: "127.0.0.1", directive: "allow" }]);
	});
	it("redacts SSO secrets in audit metadata while retaining them for configuration", async () => {
		const meta = {
			auth_type: "oauth2_proxy",
			oauth2_client_secret: "client-secret",
			oauth2_cookie_secret: "cookie-secret",
			oidc_client_secret: "oidc-secret",
			oauth2_client_id: "client-id",
		};
		await service.update(access, { id: 1, meta });
		expect(state.config.meta).toEqual(meta);
		expect(state.audit.mock.calls[0][1].meta.meta).toEqual({
			auth_type: "oauth2_proxy",
			oauth2_client_id: "client-id",
		});
	});

	it.each([
		"127.0.0.1; include /tmp/injected.conf",
		"all; deny all",
		"10.0.0.0/33",
		"::1/129",
		"example.com",
		"127.0.0.1\nallow all",
	])("rejects invalid or injected client address %s before persistence", async (address) => {
		await expect(
			service.update(access, { id: 1, clients: [{ address, directive: "allow" }] }),
		).rejects.toMatchObject({ status: 400 });
		expect(service.get).not.toHaveBeenCalled();
	});
	it.each(["127.0.0.1", "10.0.0.0/8", "::1", "2001:db8::/32", "all"])(
		"allows valid client address %s",
		async (address) => {
			await service.update(access, { id: 1, clients: [{ address, directive: "allow" }] });
			expect(state.clients[0].address).toBe(address);
		},
	);
	it.each(["admin:hash", "admin\ninjected", "admin\rinjected", "", "admin\0injected"])(
		"rejects unsafe htpasswd username %j",
		async (username) => {
			await expect(
				service.update(access, { id: 1, items: [{ username, password: "password" }] }),
			).rejects.toMatchObject({ status: 400 });
			expect(service.get).not.toHaveBeenCalled();
		},
	);
	it("masks credential hashes in expanded proxy-host access lists", () => {
		const result = service.maskItems({
			items: [{ username: "direct", password: "plaintext" }],
			proxy_hosts: [
				{
					terminal_password: "ssh-secret",
					terminal_private_key: "ssh-key",
					git_credentials: "git-secret",
					certificate: { meta: { certificate_key: "pem-key" } },
					access_list: { items: [{ username: "nested", password: "$2b$private-hash" }] },
				},
			],
		});
		expect(result.items[0]).toMatchObject({ password: "", hint: "********" });
		expect(result.proxy_hosts[0].access_list.items[0]).toMatchObject({ hint: "********" });
		expect(result.proxy_hosts[0].access_list.items[0]).not.toHaveProperty("password");
		expect(JSON.stringify(result)).not.toMatch(/ssh-secret|ssh-key|git-secret|pem-key/);
	});
});
