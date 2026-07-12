import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const settingsRouteFiles = [
	"src/pages/Settings/index.tsx",
	"src/pages/Settings/Ai.tsx",
	"src/pages/Settings/GitOps.tsx",
	"src/pages/Settings/DefaultSite.tsx",
];
const componentBarrelImport = /from ["']src\/components(?:\/index)?["']/;

describe("settings route component dependencies", () => {
	it("does not pull the shared component barrel into the Settings route", () => {
		for (const file of settingsRouteFiles) {
			const source = readFileSync(resolve(process.cwd(), file), "utf8");
			expect(source).not.toMatch(componentBarrelImport);
		}
	});
});
