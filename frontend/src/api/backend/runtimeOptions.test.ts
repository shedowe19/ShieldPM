import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getCertificateOptions,
	getIpRangesOptions,
	updateCertificateOptions,
	updateIpRangesOptions,
} from "./runtimeOptions";

vi.mock("src/modules/AuthStore", () => ({
	AUTHENTICATION_EXPIRED_EVENT: "shieldpm:authentication-expired",
	default: { csrfToken: "synthetic-csrf", sessionRevision: 1 },
}));

afterEach(() => vi.unstubAllGlobals());

describe("runtime options API contract", () => {
	it("reads and writes certificate options with the backend's snake-case fields", async () => {
		const wire = { key_type: "rsa", renewal_interval_hours: 6 };
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(wire)))),
		);
		const values = { keyType: "rsa" as const, renewalIntervalHours: 6 };
		expect(await getCertificateOptions()).toEqual(values);
		expect(await updateCertificateOptions(values)).toEqual(values);
		const [url, options] = vi.mocked(fetch).mock.calls[1];
		expect(url).toBe("/api/settings/certificate-options");
		expect(options?.method).toBe("PUT");
		expect(JSON.parse(options?.body as string)).toEqual(wire);
	});

	it("preserves a disabled refresh interval through the IP range options API", async () => {
		const wire = { enabled: false, refresh_interval_hours: 24 };
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(wire)))),
		);
		const values = { enabled: false, refreshIntervalHours: 24 };
		expect(await getIpRangesOptions()).toEqual(values);
		expect(await updateIpRangesOptions(values)).toEqual(values);
		const [url, options] = vi.mocked(fetch).mock.calls[1];
		expect(url).toBe("/api/settings/ip-ranges-options");
		expect(options?.method).toBe("PUT");
		expect(JSON.parse(options?.body as string)).toEqual(wire);
	});
});
