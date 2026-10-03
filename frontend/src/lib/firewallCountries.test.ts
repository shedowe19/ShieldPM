import { describe, expect, it } from "vitest";
import { firewallCountryName, firewallCountryOptions } from "./firewallCountries";

describe("firewall country choices", () => {
	it("uses the accepted 250-code registry including XK and localizes the country names", () => {
		const german = firewallCountryOptions("de-DE");
		expect(german).toHaveLength(250);
		expect(german).toContainEqual({ value: "DE", label: "Deutschland · DE" });
		expect(german).toContainEqual({ value: "XK", label: "Kosovo · XK" });
		expect(german.every((option) => /^[A-Z]{2}$/.test(option.value))).toBe(true);
		expect(firewallCountryName("DE", "en")).toBe("Germany");
		expect(firewallCountryName("ZZ", "de")).toBe("ZZ");
	});
});
