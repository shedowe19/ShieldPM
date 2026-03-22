import { describe, expect, it } from "vitest";
import { detectService, getIconUrl, getAllServices, ICON_CDN_BASE } from "../../lib/service-icons.js";

describe("service-icons", () => {
	describe("detectService", () => {
		it("detects jellyfin by port 8096", () => {
			const svc = detectService(8096);
			expect(svc).not.toBeNull();
			expect(svc.name).toBe("jellyfin");
		});

		it("prefers hostname match over port-only match", () => {
			// port 8080 has many services; hostname should narrow it
			const svc = detectService(8080, "zigbee2mqtt.local");
			expect(svc).not.toBeNull();
			expect(svc.name).toBe("zigbee2mqtt");
		});

		it("falls back to port-only match when hostname does not match", () => {
			const svc = detectService(8080, "randomhost");
			expect(svc).not.toBeNull();
			expect(svc.name).toBe("apache");
		});

		it("returns null for unknown port", () => {
			expect(detectService(59999)).toBeNull();
		});

		it("is case-insensitive for hostname", () => {
			const svc = detectService(8080, "ZIGBEE2MQTT.example.com");
			expect(svc).not.toBeNull();
			expect(svc.name).toBe("zigbee2mqtt");
		});

		it("detects plex on port 32400", () => {
			const svc = detectService(32400);
			expect(svc).not.toBeNull();
			expect(svc.name).toBe("plex");
		});
	});

	describe("getIconUrl", () => {
		it("constructs correct CDN URL", () => {
			expect(getIconUrl("grafana")).toBe(`${ICON_CDN_BASE}/grafana.svg`);
		});
	});

	describe("getAllServices", () => {
		it("returns an array of deduplicated services", () => {
			const all = getAllServices();
			expect(Array.isArray(all)).toBe(true);
			const names = all.map((s) => s.name);
			// should be deduplicated
			expect(new Set(names).size).toBe(names.length);
		});

		it("each service has name, displayName, iconUrl", () => {
			const all = getAllServices();
			for (const svc of all) {
				expect(svc).toHaveProperty("name");
				expect(svc).toHaveProperty("displayName");
				expect(svc).toHaveProperty("iconUrl");
			}
		});

		it("has at least 30 unique services", () => {
			expect(getAllServices().length).toBeGreaterThan(30);
		});
	});

	describe("ICON_CDN_BASE", () => {
		it("is a valid URL string", () => {
			expect(ICON_CDN_BASE).toMatch(/^https:\/\//);
		});
	});
});
