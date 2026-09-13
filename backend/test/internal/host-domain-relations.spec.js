import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ proxy: vi.fn(), redirection: vi.fn(), dead: vi.fn() }));
vi.mock("../../models/proxy_host.js", () => ({
	default: { query: mocks.proxy, relatedQuery: () => ({ whereILike: () => ({}) }) },
}));
vi.mock("../../models/redirection_host.js", () => ({ default: { query: mocks.redirection } }));
vi.mock("../../models/dead_host.js", () => ({ default: { query: mocks.dead } }));
vi.mock("../../lib/helpers.js", () => ({ castJsonIfNeed: (value) => value }));

import host from "../../internal/host.js";

function query(rows, needsDomains = false) {
	let loaded = !needsDomains;
	const builder = {
		where: () => builder,
		whereExists: () => builder,
		whereILike: () => builder,
		withGraphFetched: (graph) => {
			loaded = graph === "host_domains";
			return builder;
		},
		// biome-ignore lint/suspicious/noThenProperty: Mock the awaitable Objection query builder.
		then: (resolve, reject) =>
			Promise.resolve(rows.map((row) => ({ ...row, domain_names: loaded ? row.domains : [] }))).then(
				resolve,
				reject,
			),
	};
	return builder;
}

describe("normalized host domain lookups", () => {
	it.each(["example.test; return 200", "example.test\nserver", "foo #comment", "example.test\u0000"])(
		"rejects invalid domain token %j",
		(domain) => {
			expect(() => host.validateDomainNames([domain])).toThrow();
		},
	);
	beforeEach(() => {
		mocks.proxy.mockImplementation(() => query([{ id: 7, domains: ["app.example.test"] }], true));
		mocks.redirection.mockImplementation(() => query([]));
		mocks.dead.mockImplementation(() => query([]));
	});
	it("detects a conflicting proxy domain even when the legacy column is empty", async () => {
		await expect(host.isHostnameTaken("app.example.test")).resolves.toEqual({
			hostname: "app.example.test",
			is_taken: true,
		});
	});
	it("excludes only the host being updated", async () => {
		expect((await host.isHostnameTaken("app.example.test", "proxy", 7)).is_taken).toBe(false);
		expect((await host.isHostnameTaken("app.example.test", "dead", 7)).is_taken).toBe(true);
	});
	it("finds normalized proxy domains for certificate challenge suspension", async () => {
		const result = await host.getHostsWithDomains(["APP.example.test"]);
		expect(result.total_count).toBe(1);
		expect(result.proxy_hosts[0].id).toBe(7);
	});
	it("matches exact case-insensitive domains without substring collisions or duplicate hosts", () => {
		const row = { id: 8, domain_names: ["example.test", "other.test"] };
		expect(host._getHostsWithDomains([row], ["EXAMPLE.test", "other.test"])).toEqual([row]);
		expect(host._checkHostnameRecordsTaken("ample.test", [row])).toBe(false);
	});
});
