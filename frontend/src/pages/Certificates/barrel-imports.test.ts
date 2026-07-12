import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const certificatesRouteFiles = [
	"src/pages/Certificates/index.tsx",
	"src/pages/Certificates/TableWrapper.tsx",
	"src/pages/Certificates/Table.tsx",
];
const componentBarrelImport = /from ["']src\/components(?:\/index)?["']/;
const hookBarrelImport = /from ["']src\/hooks(?:\/index)?["']/;

describe("certificate route dependencies", () => {
	it("does not pull shared component or hook barrels into certificate management", () => {
		for (const file of certificatesRouteFiles) {
			const source = readFileSync(resolve(process.cwd(), file), "utf8");

			expect(source).not.toMatch(componentBarrelImport);
			expect(source).not.toMatch(hookBarrelImport);
		}
	});
});
