import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	audit: [],
	autoPushes: [],
	events: [],
	files: new Map(),
	hosts: [],
	policy: null,
	responses: [],
}));

vi.mock("node:fs/promises", () => {
	const missing = (filename) => Object.assign(new Error(`ENOENT: ${filename}`), { code: "ENOENT" });
	return {
		default: {
			mkdir: vi.fn(async () => undefined),
			readFile: vi.fn(async (filename) => {
				if (!state.files.has(filename)) throw missing(filename);
				return state.files.get(filename);
			}),
			rename: vi.fn(async (source, target) => {
				state.files.set(target, state.files.get(source));
				state.files.delete(source);
			}),
			rm: vi.fn(async () => undefined),
			writeFile: vi.fn(async (filename, content, options = {}) => {
				if (options.flag === "a" && state.files.has(filename)) return;
				state.files.set(filename, String(content));
			}),
		},
	};
});

vi.mock("node:https", () => ({
	default: {
		request: vi.fn((_options, onResponse) => {
			const listeners = new Map();
			const request = {
				destroy: (error) => listeners.get("error")?.(error),
				end: () => {
					const plan = state.responses.shift();
					if (plan.error) {
						queueMicrotask(() => listeners.get("error")?.(plan.error));
						return;
					}
					const responseListeners = new Map();
					const response = {
						headers: plan.headers || {},
						on: (event, listener) => {
							responseListeners.set(event, listener);
							return response;
						},
						resume: vi.fn(),
						statusCode: plan.statusCode,
					};
					onResponse(response);
					if (plan.statusCode === 200) {
						queueMicrotask(() => {
							responseListeners.get("data")?.(Buffer.from(plan.body || ""));
							responseListeners.get("end")?.();
						});
					}
				},
				on: (event, listener) => {
					listeners.set(event, listener);
					return request;
				},
				setTimeout: vi.fn(),
			};
			return request;
		}),
	},
}));

vi.mock("../../models/firewall_policy.js", () => ({
	default: {
		query: () => ({
			deleteById: async (id) => {
				state.events.push(`policy-delete:${id}`);
				state.policy = null;
			},
			findById: async (id) => (state.policy?.id === id ? state.policy : undefined),
			insertAndFetch: async (data) => {
				state.policy = { id: 17, ...data };
				return state.policy;
			},
			orderBy: async () => (state.policy ? [state.policy] : []),
			patchAndFetchById: async (id, patch) => {
				expect(id).toBe(state.policy.id);
				state.policy = { ...state.policy, ...patch };
				return state.policy;
			},
		}),
	},
}));

vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: () => {
			const query = {
				patch: async (patch) => {
					state.events.push(`host-patch:${patch.firewall_policy_id}`);
					state.hosts = state.hosts.map((host) => ({ ...host, ...patch }));
				},
				where: () => query,
				whereIn: () => query,
				withGraphFetched: async () => state.hosts,
			};
			return query;
		},
	},
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn(async (...args) => state.audit.push(args)) } }));
vi.mock("../../internal/gitops.js", () => ({
	default: { triggerAutoPush: vi.fn((...args) => state.autoPushes.push(args)) },
}));
vi.mock("../../internal/nginx.js", () => ({
	default: {
		bulkGenerateConfigs: vi.fn(async (_model, _type, hosts) => {
			state.events.push(`host-configs:${hosts.map((host) => host.firewall_policy_id).join(",")}`);
			return hosts.map(() => ({ nginx_online: true }));
		}),
		reload: vi.fn(async () => state.events.push("nginx-reload")),
	},
}));

import internalFirewallPolicy from "../../internal/firewall-policy.js";

describe("firewall policy creation with unavailable feeds", () => {
	beforeEach(() => {
		state.audit.length = 0;
		state.autoPushes.length = 0;
		state.files.clear();
		state.hosts = [];
		state.events.length = 0;
		state.policy = null;
		state.responses.length = 0;
	});

	it("persists and publishes an inactive policy instead of reporting a failed create", async () => {
		const feedUrl = "https://1.1.1.1/unavailable.txt";
		state.responses.push({ error: new Error("upstream unavailable") });
		const access = { can: vi.fn(async () => true), token: { getUserId: () => 1 } };

		const created = await internalFirewallPolicy.create(access, { name: "Unavailable feed", feed_urls: [feedUrl] });

		expect(created).toMatchObject({
			id: 17,
			name: "Unavailable feed",
			feed_status: { [feedUrl]: { cache_ready: false, error: "upstream unavailable" } },
		});
		expect(state.audit).toHaveLength(1);
		expect(state.autoPushes).toEqual([["firewall-policy"]]);
		expect(state.files.get("/data/nginx/firewall.conf")).toContain(
			'map "" $shieldpm_firewall_17_enabled {\n    default 0;',
		);
	});

	it("rolls back an update when a replacement feed has no usable cache", async () => {
		const feedUrl = "https://1.1.1.1/replacement.txt";
		const original = {
			action: "deny",
			allow_cidrs: [],
			block_cidrs: [],
			enabled: true,
			feed_status: {},
			feed_urls: [],
			geo_countries: [],
			geo_mode: "off",
			id: 17,
			last_error: null,
			last_updated_on: null,
			name: "Original policy",
			refresh_interval_hours: 24,
			total_cidrs: 0,
		};
		state.policy = { ...original };
		state.responses.push({ error: new Error("upstream unavailable") });
		const access = { can: vi.fn(async () => true), token: { getUserId: () => 1 } };

		await expect(
			internalFirewallPolicy.update(access, 17, { feed_urls: [feedUrl], name: "Rejected edit" }),
		).rejects.toThrow("cache incomplete");

		expect(state.policy).toMatchObject(original);
		expect(state.audit).toHaveLength(0);
		expect(state.autoPushes).toHaveLength(0);
	});

	it("regenerates every linked host before deleting the policy maps", async () => {
		state.policy = {
			action: "deny",
			allow_cidrs: [],
			block_cidrs: [],
			enabled: true,
			feed_status: {},
			feed_urls: [],
			geo_countries: [],
			geo_mode: "off",
			id: 17,
			name: "Attached policy",
			refresh_interval_hours: 24,
			total_cidrs: 0,
		};
		state.hosts = [
			{ firewall_policy_id: 17, id: 41, meta: {} },
			{ firewall_policy_id: 17, id: 42, meta: {} },
		];
		const access = { can: vi.fn(async () => true), token: { getUserId: () => 1 } };

		await internalFirewallPolicy.delete(access, 17);

		expect(state.events).toEqual(["host-configs:,", "host-patch:null", "policy-delete:17", "nginx-reload"]);
		expect(state.hosts.every((host) => host.firewall_policy_id === null)).toBe(true);
	});
});
