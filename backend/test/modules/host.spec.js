import { describe, expect, it, vi } from "vitest";

vi.mock("lodash", () => ({
	default: {
		assign: (...args) => Object.assign({}, ...args),
	},
}));

vi.mock("../../lib/helpers.js", () => ({
	castJsonIfNeed: vi.fn((col) => col),
}));

vi.mock("../../models/proxy_host.js", () => ({
	default: { query: vi.fn(), relatedQuery: vi.fn() },
}));

vi.mock("../../models/redirection_host.js", () => ({
	default: { query: vi.fn() },
}));

vi.mock("../../models/dead_host.js", () => ({
	default: { query: vi.fn() },
}));

import {
	cleanAllRowsCertificateMeta,
	cleanRowCertificateMeta,
	cleanSslHstsData,
} from "../../modules/host/certificate.js";
import { checkHostnameRecordsTaken, getHostsWithDomainsFromList } from "../../modules/host/domains.js";

describe("host module – certificate helpers", () => {
	// ── cleanSslHstsData ────────────────────────────────────────────────

	describe("cleanSslHstsData", () => {
		it("should disable hsts and ssl_forced when no certificate and not newCert", () => {
			const result = cleanSslHstsData(false, { ssl_forced: true, hsts_subdomains: true });
			expect(result.ssl_forced).toBe(false);
			expect(result.hsts_subdomains).toBe(false);
			expect(result.hsts_enabled).toBe(false);
		});

		it("should keep ssl settings when certificate_id is present", () => {
			const result = cleanSslHstsData(false, {
				certificate_id: 5,
				ssl_forced: true,
				hsts_subdomains: true,
				hsts_enabled: true,
			});
			expect(result.ssl_forced).toBe(true);
			expect(result.hsts_subdomains).toBe(true);
		});

		it("should keep ssl settings when newCert is true", () => {
			const result = cleanSslHstsData(true, { ssl_forced: true, hsts_subdomains: true });
			expect(result.hsts_subdomains).toBe(true);
		});

		it("should disable hsts_enabled when ssl_forced is false", () => {
			const result = cleanSslHstsData(false, {
				certificate_id: 5,
				ssl_forced: false,
				hsts_enabled: true,
			});
			expect(result.hsts_enabled).toBe(false);
		});

		it("should merge existing data with new data", () => {
			const result = cleanSslHstsData(
				false,
				{ name: "updated", certificate_id: 5, ssl_forced: true },
				{ name: "original", domain_names: ["a.com"] },
			);
			expect(result.name).toBe("updated");
			expect(result.domain_names).toEqual(["a.com"]);
		});
	});

	// ── cleanRowCertificateMeta ─────────────────────────────────────────

	describe("cleanRowCertificateMeta", () => {
		it("should clear certificate meta", () => {
			const row = { id: 1, certificate: { id: 5, meta: { sensitive: "data" } } };
			const result = cleanRowCertificateMeta(row);
			expect(result.certificate.meta).toEqual({});
		});

		it("should handle row without certificate", () => {
			const row = { id: 1 };
			const result = cleanRowCertificateMeta(row);
			expect(result).toEqual({ id: 1 });
		});

		it("should handle row with null certificate", () => {
			const row = { id: 1, certificate: null };
			const result = cleanRowCertificateMeta(row);
			expect(result.certificate).toBeNull();
		});
	});

	// ── cleanAllRowsCertificateMeta ──────────────────────────────────────

	describe("cleanAllRowsCertificateMeta", () => {
		it("should clear meta on all rows with certificates", () => {
			const rows = [
				{ id: 1, certificate: { meta: { key: "value" } } },
				{ id: 2 },
				{ id: 3, certificate: { meta: { api_key: "secret" } } },
			];
			const result = cleanAllRowsCertificateMeta(rows);
			expect(result[0].certificate.meta).toEqual({});
			expect(result[2].certificate.meta).toEqual({});
		});
	});
});

describe("host module – domain helpers", () => {
	// ── checkHostnameRecordsTaken ────────────────────────────────────────

	describe("checkHostnameRecordsTaken", () => {
		it("should return true when hostname is found in existing rows", () => {
			const existing = [{ id: 1, domain_names: ["example.com", "www.example.com"] }];
			expect(checkHostnameRecordsTaken("example.com", existing)).toBe(true);
		});

		it("should return false when hostname is not found", () => {
			const existing = [{ id: 1, domain_names: ["example.com"] }];
			expect(checkHostnameRecordsTaken("other.com", existing)).toBe(false);
		});

		it("should be case-insensitive", () => {
			const existing = [{ id: 1, domain_names: ["Example.COM"] }];
			expect(checkHostnameRecordsTaken("example.com", existing)).toBe(true);
		});

		it("should respect ignoreId", () => {
			const existing = [{ id: 5, domain_names: ["example.com"] }];
			expect(checkHostnameRecordsTaken("example.com", existing, 5)).toBe(false);
		});

		it("should still return true when ignoreId does not match", () => {
			const existing = [{ id: 5, domain_names: ["example.com"] }];
			expect(checkHostnameRecordsTaken("example.com", existing, 99)).toBe(true);
		});

		it("should return false for empty rows", () => {
			expect(checkHostnameRecordsTaken("test.com", [])).toBe(false);
		});

		it("should return false for null rows", () => {
			expect(checkHostnameRecordsTaken("test.com", null)).toBe(false);
		});
	});

	// ── getHostsWithDomainsFromList ─────────────────────────────────────

	describe("getHostsWithDomainsFromList", () => {
		it("should return hosts matching any of the given domain names", () => {
			const hosts = [
				{ id: 1, domain_names: ["a.com"] },
				{ id: 2, domain_names: ["b.com", "c.com"] },
				{ id: 3, domain_names: ["d.com"] },
			];
			const result = getHostsWithDomainsFromList(hosts, ["b.com", "d.com"]);
			expect(result).toHaveLength(2);
			expect(result.map((h) => h.id)).toEqual([2, 3]);
		});

		it("should return empty array when no matches", () => {
			const hosts = [{ id: 1, domain_names: ["a.com"] }];
			expect(getHostsWithDomainsFromList(hosts, ["z.com"])).toEqual([]);
		});

		it("should handle empty hosts", () => {
			expect(getHostsWithDomainsFromList([], ["a.com"])).toEqual([]);
		});

		it("should handle null hosts", () => {
			expect(getHostsWithDomainsFromList(null, ["a.com"])).toEqual([]);
		});

		it("should be case-insensitive", () => {
			const hosts = [{ id: 1, domain_names: ["Example.COM"] }];
			const result = getHostsWithDomainsFromList(hosts, ["example.com"]);
			expect(result).toHaveLength(1);
		});
	});
});
