import { expect, it } from "vitest";
import { getHelpFile } from "./index";

it("resolves the supplied Spanish help document before falling back to English", () => {
	expect(getHelpFile("es", "Certificates")).toContain("/es/Certificates.md");
	expect(getHelpFile("unknown", "Certificates")).toBe(getHelpFile("en", "Certificates"));
});
