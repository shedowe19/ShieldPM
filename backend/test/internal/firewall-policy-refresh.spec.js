import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	files: new Map(),
	patches: [],
	policy: null,
	requests: [],
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
		request: vi.fn((options, onResponse) => {
			state.requests.push(options);
			const listeners = new Map();
			const request = {
				destroy: (error) => listeners.get("error")?.(error),
				end: () => {
					const responsePlan = state.responses.shift();
					if (responsePlan.error) {
						queueMicrotask(() => listeners.get("error")?.(responsePlan.error));
						return;
					}
					const responseListeners = new Map();
					const response = {
						headers: responsePlan.headers || {},
						on: (event, listener) => {
							responseListeners.set(event, listener);
							return response;
						},
						resume: vi.fn(),
						statusCode: responsePlan.statusCode,
					};
					onResponse(response);
					if (responsePlan.statusCode === 200) {
						queueMicrotask(() => {
							responseListeners.get("data")?.(Buffer.from(responsePlan.body || ""));
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

vi.mock("../../internal/audit-log.js", () => ({ default: {} }));
vi.mock("../../internal/gitops.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../models/firewall_policy.js", () => ({
	default: {
		query: () => ({
			orderBy: async () => [state.policy],
			patchAndFetchById: async (id, patch) => {
				state.patches.push({ id, patch });
				state.policy = { ...state.policy, ...patch };
				return state.policy;
			},
		}),
	},
}));

import { feedFile, refreshPolicy, renderNginxConfig, writeFirewallConfig } from "../../internal/firewall-policy.js";

const url = "https://1.1.1.1/cidrs.txt";
const policy = () => ({
	block_cidrs: [],
	feed_status: { [url]: { etag: '"old"', lastModified: "Mon, 01 Jan 2024 00:00:00 GMT" } },
	feed_urls: [url],
	id: 7,
});

describe("firewall feed cache refresh", () => {
	beforeEach(() => {
		state.files.clear();
		state.patches.length = 0;
		state.policy = policy();
		state.requests.length = 0;
		state.responses.length = 0;
	});

	it("retries an unexpected 304 without validators when the feed cache is missing", async () => {
		state.responses.push(
			{ statusCode: 304 },
			{ body: "8.8.8.0/24\n", headers: { etag: '"new"' }, statusCode: 200 },
		);

		await refreshPolicy(state.policy, { regenerate: false });

		expect(state.requests).toHaveLength(2);
		expect(state.requests.map((request) => request.headers["If-None-Match"])).toEqual([undefined, undefined]);
		expect(state.files.get(feedFile(7, url))).toBe("8.8.8.0/24 1;\n");
		expect(state.policy.feed_status[url]).toMatchObject({ cache_ready: true, count: 1, etag: '"new"' });
	});

	it("keeps a last-known-good cache when the replacement feed fails", async () => {
		state.files.set(feedFile(7, url), "9.9.9.0/24 1;\n");
		state.responses.push({ error: new Error("upstream unavailable") });

		await refreshPolicy(state.policy, { regenerate: false });

		expect(state.files.get(feedFile(7, url))).toBe("9.9.9.0/24 1;\n");
		expect(state.policy.feed_status[url]).toMatchObject({ cache_ready: true, error: "upstream unavailable" });
		expect(state.requests[0].headers["If-None-Match"]).toBe('"old"');
	});

	it("marks a cacheless policy inactive rather than activating an empty feed rule", async () => {
		state.responses.push({ error: new Error("upstream unavailable") });

		await expect(refreshPolicy(state.policy, { regenerate: false })).rejects.toThrow("cache incomplete");

		expect(state.policy.feed_status[url]).toMatchObject({ cache_ready: false, error: "upstream unavailable" });
		await writeFirewallConfig();
		expect(state.files.get("/data/nginx/firewall.conf")).toContain(
			'map "" $shieldpm_firewall_7_enabled {\n    default 0;',
		);
		expect(renderNginxConfig([state.policy])).toContain('map "" $shieldpm_firewall_7_enabled {\n    default 0;');
	});

	it("rejects an oversized feed before replacing the current cache", async () => {
		const cidrs = Array.from(
			{ length: 10_001 },
			(_, index) => `10.${Math.floor(index / 65_536)}.${Math.floor((index % 65_536) / 256)}.${index % 256}/32`,
		).join("\n");
		state.responses.push({ body: cidrs, statusCode: 200 });

		await expect(refreshPolicy(state.policy, { regenerate: false })).rejects.toThrow("CIDR limit");

		expect(state.files.has(feedFile(7, url))).toBe(false);
	});

	it("rejects aggregate feed CIDRs above the policy limit before replacing any cache", async () => {
		const secondUrl = "https://1.1.1.1/cidrs-2.txt";
		const cidrs = (firstOctet) =>
			Array.from(
				{ length: 6_000 },
				(_, index) =>
					`${firstOctet}.${Math.floor(index / 65_536)}.${Math.floor((index % 65_536) / 256)}.${index % 256}/32`,
			).join("\n");
		state.policy = { ...policy(), feed_urls: [url, secondUrl] };
		state.responses.push({ body: cidrs(10), statusCode: 200 }, { body: cidrs(11), statusCode: 200 });

		await expect(refreshPolicy(state.policy, { regenerate: false })).rejects.toThrow("CIDR limit");

		expect(state.files.has(feedFile(7, url))).toBe(false);
		expect(state.files.has(feedFile(7, secondUrl))).toBe(false);
	});
});
