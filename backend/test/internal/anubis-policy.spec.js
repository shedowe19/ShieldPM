import * as yaml from "js-yaml";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ hosts: vi.fn(), write: vi.fn() }));
vi.mock("node:fs", () => ({ default: { writeFileSync: mocks.write } }));
vi.mock("node:child_process", () => ({ exec: vi.fn() }));
vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: () => {
			const builder = { where: () => builder, withGraphFetched: mocks.hosts };
			return builder;
		},
	},
}));

import anubis from "../../internal/anubis.js";

afterEach(() => {
	anubis.generatePolicy.cancel();
	vi.clearAllMocks();
});
describe("Anubis host policy contracts", () => {
	it("does not let a late database response overwrite a newer policy", async () => {
		let release;
		mocks.hosts
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						release = resolve;
					}),
			)
			.mockResolvedValueOnce([]);
		anubis.generatePolicy();
		const previous = anubis.generatePolicy.flush();
		anubis.generatePolicy();
		await anubis.generatePolicy.flush();
		release([{ domain_names: ["old.test"], anubis_rules: [{ action: "ALLOW" }] }]);
		await previous;
		expect(mocks.write).toHaveBeenCalledTimes(1);
		expect(mocks.write.mock.calls[0][1]).not.toContain("old.test");
	});
	it("matches normalized IDNs and all wildcard subdomain levels while retaining header constraints", async () => {
		mocks.hosts.mockResolvedValue([
			{
				domain_names: ["*.BÜCHER.test"],
				anubis_rules: [
					{
						action: "ALLOW",
						headers: { "X-Application": "^trusted$", "x-shieldpm-host": ".*" },
					},
				],
			},
		]);
		anubis.generatePolicy();
		await anubis.generatePolicy.flush();
		const rule = yaml.load(mocks.write.mock.calls[0][1]).bots[0];
		expect(rule.headers_regex["X-Application"]).toBe("^trusted$");
		const domains = new RegExp(rule.headers_regex["X-Shieldpm-Host"]);
		expect(domains.test("one.two.xn--bcher-kva.test")).toBe(true);
		expect(domains.test("other.test")).toBe(false);
		expect(rule.headers_regex).not.toHaveProperty("x-shieldpm-host");
	});
});
