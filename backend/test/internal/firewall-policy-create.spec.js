import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	audit: [],
	autoPushes: [],
	files: new Map(),
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
				where: () => query,
				withGraphFetched: async () => [],
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
	default: { bulkGenerateConfigs: vi.fn(async () => undefined), reload: vi.fn(async () => undefined) },
}));

import internalFirewallPolicy from "../../internal/firewall-policy.js";

describe("firewall policy creation with unavailable feeds", () => {
	beforeEach(() => {
		state.audit.length = 0;
		state.autoPushes.length = 0;
		state.files.clear();
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
});
