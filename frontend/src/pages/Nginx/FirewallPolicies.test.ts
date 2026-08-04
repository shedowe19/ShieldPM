import { describe, expect, it } from "vitest";
import { commaSeparatedLines, newlineSeparatedLines } from "./FirewallPolicies";

describe("FirewallPolicies feed URL parsing", () => {
	it("preserves commas inside valid feed paths and query strings", () => {
		expect(newlineSeparatedLines("https://feeds.example/list?groups=a,b\nhttps://feeds.example/next")).toEqual([
			"https://feeds.example/list?groups=a,b",
			"https://feeds.example/next",
		]);
	});

	it("continues to accept commas for country codes and CIDRs", () => {
		expect(commaSeparatedLines("de, GB\nUS")).toEqual(["de", "GB", "US"]);
	});
});
