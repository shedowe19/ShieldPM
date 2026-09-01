import { describe, expect, it, vi } from "vitest";

vi.mock("../../db.js", () => ({ default: () => ({}) }));
vi.mock("../../models/access_list_auth.js", () => ({ default: class AccessListAuth {} }));
vi.mock("../../models/access_list_client.js", () => ({ default: class AccessListClient {} }));
vi.mock("../../models/proxy_host.js", () => ({ default: class ProxyHost {} }));
vi.mock("../../models/user.js", () => ({ default: class User {} }));

import AccessList from "../../models/access_list.js";

describe("Access list native boolean fields", () => {
	it.each([
		[true, true],
		[false, false],
		[1, true],
		[0, false],
	])("normalizes mtls_enabled value %s to %s when reading", (storedValue, expectedValue) => {
		const accessList = new AccessList();

		const parsed = accessList.$parseDatabaseJson({ mtls_enabled: storedValue });

		expect(parsed.mtls_enabled).toBe(expectedValue);
	});

	it.each([
		[true, true],
		[false, false],
		[1, true],
		[0, false],
	])("formats mtls_enabled value %s as database boolean %s", (modelValue, expectedValue) => {
		const accessList = new AccessList();

		const formatted = accessList.$formatDatabaseJson({ mtls_enabled: modelValue });

		expect(formatted.mtls_enabled).toBe(expectedValue);
		expect(typeof formatted.mtls_enabled).toBe("boolean");
	});

	it("keeps historical integer-backed flags in their existing database representation", () => {
		const accessList = new AccessList();

		const formatted = accessList.$formatDatabaseJson({
			is_deleted: true,
			mtls_use_internal: false,
			pass_auth: true,
			satisfy_any: false,
		});

		expect(formatted).toMatchObject({
			is_deleted: 1,
			mtls_use_internal: 0,
			pass_auth: 1,
			satisfy_any: 0,
		});
	});
});
