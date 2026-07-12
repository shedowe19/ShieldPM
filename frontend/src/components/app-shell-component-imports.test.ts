import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appShellComponentFiles = [
	"src/components/ErrorNotFound.tsx",
	"src/components/HasPermission.tsx",
	"src/components/LoadingPage.tsx",
	"src/components/LocalePicker.tsx",
	"src/components/SiteHeader.tsx",
	"src/components/Unhealthy.tsx",
];
const componentBarrelImport = /from ["']src\/components(?:\/index)?["']/;

describe("app shell component dependencies", () => {
	it("does not load the shared component barrel through static shell controls", () => {
		for (const file of appShellComponentFiles) {
			const source = readFileSync(resolve(process.cwd(), file), "utf8");
			expect(source).not.toMatch(componentBarrelImport);
		}
	});

	it("treats explicit component index imports as barrel imports", () => {
		expect('import { Button } from "src/components/index";').toMatch(componentBarrelImport);
		expect("import { Button } from 'src/components/index';").toMatch(componentBarrelImport);
	});
});
