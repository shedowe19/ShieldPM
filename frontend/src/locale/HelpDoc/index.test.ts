import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { getHelpFile } from "./index";

it("resolves the supplied Spanish help document before falling back to English", () => {
	expect(getHelpFile("es", "Certificates")).toContain("/es/Certificates.md");
	expect(getHelpFile("unknown", "Certificates")).toBe(getHelpFile("en", "Certificates"));
});

it.each(["en", "de"])("resolves actual %s WireGuard help content for the page's help section", (language) => {
	expect(getHelpFile(language, "WireguardTunnels")).toContain(`/${language}/WireguardTunnels.md`);
	const content = readFileSync(resolve(process.cwd(), `src/locale/HelpDoc/${language}/WireguardTunnels.md`), "utf8");
	expect(content).toMatch(/^## WireGuard/);
	expect(content).toContain("10.8.0.0/24");
	expect(content).toContain("0.0.0.0/0");
});

it.each(["es", "unknown"])("falls back to English WireGuard help for %s", (language) => {
	expect(getHelpFile(language, "WireguardTunnels")).toBe(getHelpFile("en", "WireguardTunnels"));
});
