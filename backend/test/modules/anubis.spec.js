import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../models/proxy_host.js", () => ({
	default: { query: vi.fn(() => mockQuery) },
}));

vi.mock("../../logger.js", () => ({
	internal: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("node:child_process", () => ({
	exec: vi.fn((_cmd, cb) => cb?.(null)),
}));

vi.mock("node:fs", () => ({
	default: { writeFileSync: vi.fn() },
	writeFileSync: vi.fn(),
}));

vi.mock("js-yaml", () => ({
	default: { dump: vi.fn((obj) => JSON.stringify(obj)) },
}));

const mockQuery = {
	where: vi.fn().mockReturnThis(),
};

import { buildPolicy } from "../../modules/anubis/policy.js";

describe("anubis module – buildPolicy", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should return placeholder rule when no hosts have rules", () => {
		const result = buildPolicy([]);
		expect(result.bots).toHaveLength(1);
		expect(result.bots[0].name).toBe("shieldpm-placeholder");
		expect(result.bots[0].action).toBe("DENY");
	});

	it("should return placeholder when hosts have no anubis_rules", () => {
		const hosts = [{ domain_names: ["test.com"], anubis_rules: null }];
		const result = buildPolicy(hosts);
		expect(result.bots).toHaveLength(1);
		expect(result.bots[0].name).toBe("shieldpm-placeholder");
	});

	it("should create rules from host anubis_rules", () => {
		const hosts = [{
			domain_names: ["example.com"],
			anubis_rules: [{ action: "ALLOW", path: "/api", name: "allow-api" }],
		}];
		const result = buildPolicy(hosts);
		expect(result.bots).toHaveLength(1);
		expect(result.bots[0].name).toBe("allow-api");
		expect(result.bots[0].action).toBe("ALLOW");
		expect(result.bots[0].path_regex).toBe("/api");
		expect(result.bots[0].headers_regex["X-Shieldpm-Host"]).toBe("^example\\.com$");
	});

	it("should handle multiple domains with regex OR", () => {
		const hosts = [{
			domain_names: ["a.com", "b.com"],
			anubis_rules: [{ action: "DENY" }],
		}];
		const result = buildPolicy(hosts);
		expect(result.bots[0].headers_regex["X-Shieldpm-Host"]).toBe("^(a\\.com|b\\.com)$");
	});

	it("should skip rules without action", () => {
		const hosts = [{
			domain_names: ["test.com"],
			anubis_rules: [{ path: "/skip" }],
		}];
		const result = buildPolicy(hosts);
		expect(result.bots).toHaveLength(1);
		expect(result.bots[0].name).toBe("shieldpm-placeholder");
	});

	it("should skip hosts without domain_names", () => {
		const hosts = [{
			domain_names: [],
			anubis_rules: [{ action: "ALLOW" }],
		}];
		const result = buildPolicy(hosts);
		expect(result.bots).toHaveLength(1);
		expect(result.bots[0].name).toBe("shieldpm-placeholder");
	});

	it("should handle user_agent_regex", () => {
		const hosts = [{
			domain_names: ["test.com"],
			anubis_rules: [{ action: "DENY", userAgent: "Googlebot" }],
		}];
		const result = buildPolicy(hosts);
		expect(result.bots[0].user_agent_regex).toBe("Googlebot");
	});

	it("should handle remote_addresses", () => {
		const hosts = [{
			domain_names: ["test.com"],
			anubis_rules: [{ action: "ALLOW", remoteAddresses: ["10.0.0.0/8"] }],
		}];
		const result = buildPolicy(hosts);
		expect(result.bots[0].remote_addresses).toEqual(["10.0.0.0/8"]);
	});

	it("should handle CHALLENGE action with difficulty and algorithm", () => {
		const hosts = [{
			domain_names: ["test.com"],
			anubis_rules: [{
				action: "CHALLENGE",
				challengeDifficulty: "5",
				challengeAlgorithm: "fast",
			}],
		}];
		const result = buildPolicy(hosts);
		expect(result.bots[0].challenge).toEqual({ difficulty: 5, algorithm: "fast" });
	});

	it("should not include challenge for non-CHALLENGE actions", () => {
		const hosts = [{
			domain_names: ["test.com"],
			anubis_rules: [{ action: "ALLOW", challengeDifficulty: "5" }],
		}];
		const result = buildPolicy(hosts);
		expect(result.bots[0].challenge).toBeUndefined();
	});

	it("should generate auto name when rule has no name", () => {
		const hosts = [{
			domain_names: ["my-site.com"],
			anubis_rules: [{ action: "DENY" }],
		}];
		const result = buildPolicy(hosts);
		expect(result.bots[0].name).toMatch(/^shieldpm-my-site-com-/);
	});
});
