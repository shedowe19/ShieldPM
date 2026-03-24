import { describe, expect, it } from "vitest";
import { ICON_CDN_BASE, detectService, getAllServices, getIconUrl } from "./serviceIcons";

describe("detectService", () => {
	it("returns null for unknown port", () => {
		expect(detectService(12345)).toBeNull();
	});

	it("matches port-only service (no hostname needed)", () => {
		const result = detectService(8096);
		expect(result).not.toBeNull();
		expect(result?.name).toBe("jellyfin");
		expect(result?.displayName).toBe("Jellyfin");
	});

	it("matches by port + hostname when hostname specified in definition", () => {
		const result = detectService(8080, "zigbee2mqtt.local");
		expect(result).not.toBeNull();
		expect(result?.name).toBe("zigbee2mqtt");
	});

	it("hostname match takes priority over port-only match", () => {
		// Port 8080 has many entries; traefik requires hostname
		const result = detectService(8080, "traefik.example.com");
		expect(result?.name).toBe("traefik");
	});

	it("falls back to port-only match when hostname does not match", () => {
		// Port 8080 with unknown hostname falls back to apache (port-only, no hostname)
		const result = detectService(8080, "unknown-host");
		expect(result?.name).toBe("apache");
	});

	it("hostname matching is case-insensitive", () => {
		const result = detectService(8080, "ZIGBEE2MQTT.local");
		expect(result?.name).toBe("zigbee2mqtt");
	});

	it("handles empty hostname string", () => {
		const result = detectService(32400, "");
		expect(result?.name).toBe("plex");
	});
});

describe("getIconUrl", () => {
	it("returns correct CDN URL for a service name", () => {
		expect(getIconUrl("jellyfin")).toBe(`${ICON_CDN_BASE}/jellyfin.svg`);
	});

	it("constructs URL for any arbitrary name", () => {
		expect(getIconUrl("my-custom-service")).toBe(`${ICON_CDN_BASE}/my-custom-service.svg`);
	});
});

describe("getAllServices", () => {
	it("returns an array of unique services", () => {
		const services = getAllServices();
		expect(services.length).toBeGreaterThan(0);

		// Check uniqueness by name
		const names = services.map((s) => s.name);
		const uniqueNames = new Set(names);
		expect(names.length).toBe(uniqueNames.size);
	});

	it("each service has name, displayName, and iconUrl", () => {
		const services = getAllServices();
		for (const s of services) {
			expect(s.name).toBeTruthy();
			expect(s.displayName).toBeTruthy();
			expect(s.iconUrl).toContain(s.name);
		}
	});
});
