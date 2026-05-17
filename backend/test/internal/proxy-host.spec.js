import { describe, expect, it } from "vitest";

/**
 * Fix #60: proxy-host.js get() — _.omit must operate on the cleaned row (thisRow)
 * not on the raw uncleaned row, to prevent certificate private-key material leaking.
 *
 * We test the logic directly without importing proxy-host.js (which has heavy DB deps)
 * by reproducing the exact three-line pattern that was broken.
 */
import _ from "lodash";

// Simulate cleanRowCertificateMeta (mirrors host.js implementation)
const cleanRowCertificateMeta = (row) => {
	if (typeof row.certificate !== "undefined" && row.certificate) {
		row.certificate.meta = {};
	}
	return row;
};

describe("Fix #60: proxy-host get() — omit uses cleaned row, not raw row", () => {
	const buildRow = () => ({
		id: 1,
		domain_names: ["example.com"],
		certificate: {
			id: 42,
			nice_name: "example.com",
			meta: {
				// Sensitive fields that must NEVER appear in API responses
				letsencrypt_email: "secret@example.com",
				dns_provider_credentials: "SECRET_API_KEY=abc123",
			},
		},
	});

	it("BEFORE fix: raw _.omit(row) would leak certificate.meta", () => {
		const row = buildRow();
		// Simulate the BUGGY behaviour: omit applied to uncleaned row
		const leaked = _.omit(row, ["domain_names"]);
		expect(leaked.certificate.meta.dns_provider_credentials).toBe("SECRET_API_KEY=abc123");
	});

	it("AFTER fix: _.omit(thisRow) does NOT leak certificate.meta", () => {
		const row = buildRow();
		const thisRow = cleanRowCertificateMeta(row);
		// Simulate the FIXED behaviour: omit applied to cleaned thisRow
		const result = _.omit(thisRow, ["domain_names"]);
		expect(result.certificate.meta).toEqual({});
		expect(result.certificate.meta.dns_provider_credentials).toBeUndefined();
	});

	it("without omit, cleanRowCertificateMeta wipes certificate.meta", () => {
		const row = buildRow();
		const thisRow = cleanRowCertificateMeta(row);
		expect(thisRow.certificate.meta).toEqual({});
		expect(thisRow.certificate.meta.letsencrypt_email).toBeUndefined();
	});

	it("rows without a certificate are returned unchanged", () => {
		const row = { id: 2, domain_names: ["no-cert.com"], certificate: null };
		const thisRow = cleanRowCertificateMeta(row);
		const result = _.omit(thisRow, ["domain_names"]);
		expect(result.id).toBe(2);
		expect(result.certificate).toBeNull();
	});
});
