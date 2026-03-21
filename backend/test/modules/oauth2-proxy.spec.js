import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
	spawn: vi.fn(() => mockChild),
	execSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
	default: {
		promises: {
			mkdir: vi.fn().mockResolvedValue(),
			writeFile: vi.fn().mockResolvedValue(),
		},
	},
}));

vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../models/access_list.js", () => ({
	default: { query: vi.fn(() => mockAccessListQuery) },
}));

vi.mock("../../models/proxy_host.js", () => ({
	default: { query: vi.fn(() => mockProxyHostQuery) },
}));

const mockChild = {
	stdout: { on: vi.fn() },
	stderr: { on: vi.fn() },
	on: vi.fn(),
	kill: vi.fn(),
	unref: vi.fn(),
};

const mockAccessListQuery = {
	where: vi.fn().mockResolvedValue([]),
};

const mockProxyHostQuery = {
	where: vi.fn().mockReturnThis(),
};

import {
	deleteProcess,
	getProcess,
	hasProcess,
	processes,
	setProcess,
	dataPath,
} from "../../modules/oauth2-proxy/state.js";
import oauth2ProxyService from "../../modules/oauth2-proxy/service.js";

describe("oauth2-proxy module", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		processes.clear();
	});

	describe("state management", () => {
		it("should set and get process", () => {
			setProcess(1, { pid: 100 });
			expect(getProcess(1)).toEqual({ pid: 100 });
		});

		it("should check process existence", () => {
			expect(hasProcess(5)).toBe(false);
			setProcess(5, {});
			expect(hasProcess(5)).toBe(true);
		});

		it("should delete process", () => {
			setProcess(3, {});
			deleteProcess(3);
			expect(hasProcess(3)).toBe(false);
		});

		it("should have default dataPath", () => {
			expect(typeof dataPath).toBe("string");
		});
	});

	describe("generateConfig", () => {
		it("should generate valid TOML-like config", () => {
			const list = {
				id: 1,
				meta: {
					oauth2_provider: "google",
					oauth2_client_id: "client-id",
					oauth2_client_secret: "client-secret",
					oauth2_cookie_secret: "cookie-secret",
					oauth2_allowed_email_domains: "example.com,test.com",
				},
			};
			const config = oauth2ProxyService.generateConfig(list);
			expect(config).toContain('provider = "google"');
			expect(config).toContain('client_id = "client-id"');
			expect(config).toContain('"example.com"');
			expect(config).toContain('"test.com"');
		});

		it("should include OIDC issuer for oidc provider", () => {
			const list = {
				id: 2,
				meta: {
					oauth2_provider: "oidc",
					oauth2_client_id: "id",
					oauth2_client_secret: "secret",
					oauth2_cookie_secret: "cookie",
					oauth2_oidc_issuer_url: "https://idp.example.com",
				},
			};
			const config = oauth2ProxyService.generateConfig(list);
			expect(config).toContain('oidc_issuer_url = "https://idp.example.com"');
		});

		it("should include allowed emails file when configured", () => {
			const list = {
				id: 3,
				meta: {
					oauth2_provider: "google",
					oauth2_client_id: "id",
					oauth2_client_secret: "secret",
					oauth2_cookie_secret: "cookie",
					oauth2_allowed_emails: "user@test.com,admin@test.com",
				},
			};
			const config = oauth2ProxyService.generateConfig(list);
			expect(config).toContain("authenticated_emails_file");
		});

		it("should include allowed groups when configured", () => {
			const list = {
				id: 4,
				meta: {
					oauth2_provider: "google",
					oauth2_client_id: "id",
					oauth2_client_secret: "secret",
					oauth2_cookie_secret: "cookie",
					oauth2_allowed_groups: "admins,users",
				},
			};
			const config = oauth2ProxyService.generateConfig(list);
			expect(config).toContain("allowed_groups");
			expect(config).toContain('"admins"');
		});

		it("should use custom prefix if provided", () => {
			const list = {
				id: 5,
				meta: {
					oauth2_proxy_prefix: "/auth/",
					oauth2_provider: "google",
					oauth2_client_id: "id",
					oauth2_client_secret: "secret",
					oauth2_cookie_secret: "cookie",
				},
			};
			const config = oauth2ProxyService.generateConfig(list);
			expect(config).toContain('proxy_prefix = "/auth/"');
		});
	});
});
