import { afterEach, expect, it, vi } from "vitest";
import { getFirewallGeoipStatus } from "./firewallGeoip";

afterEach(() => vi.unstubAllGlobals());

it("uses the shared authenticated client for GeoIP readiness and preserves an unavailable status", async () => {
	const fetchMock = vi.fn().mockResolvedValue(
		new Response(
			JSON.stringify({
				available: false,
				module_enabled: true,
				database_present: false,
				reason: "database_missing",
				asn: { available: true, module_enabled: true, database_present: true, reason: null },
			}),
		),
	);
	vi.stubGlobal("fetch", fetchMock);
	await expect(getFirewallGeoipStatus()).resolves.toEqual({
		available: false,
		moduleEnabled: true,
		databasePresent: false,
		reason: "database_missing",
		asn: { available: true, moduleEnabled: true, databasePresent: true, reason: null },
	});
	expect(fetchMock).toHaveBeenCalledWith(
		"/api/nginx/firewall-lists/geoip",
		expect.objectContaining({ method: "GET", credentials: "include" }),
	);
});

it("reports a failed capability request instead of converting it to an available capability", async () => {
	vi.stubGlobal(
		"fetch",
		vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify({ error: { message: "Capability check failed" } }), { status: 503 }),
			),
	);
	await expect(getFirewallGeoipStatus()).rejects.toThrow("Capability check failed");
});
