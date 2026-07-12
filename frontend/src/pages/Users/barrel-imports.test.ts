import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const usersRouteFiles = ["src/pages/Users/index.tsx", "src/pages/Users/TableWrapper.tsx", "src/pages/Users/Table.tsx"];
const componentBarrelImport = /from ["']src\/components(?:\/index)?["']/;
const hookBarrelImport = /from ["']src\/hooks(?:\/index)?["']/;

describe("users route dependencies", () => {
	it("does not pull shared component or hook barrels into user management", () => {
		for (const file of usersRouteFiles) {
			const source = readFileSync(resolve(process.cwd(), file), "utf8");

			expect(source).not.toMatch(componentBarrelImport);
			expect(source).not.toMatch(hookBarrelImport);
		}
	});

	it("keeps the user table empty state independent of the component barrel", () => {
		const source = readFileSync(resolve(process.cwd(), "src/components/EmptyData.tsx"), "utf8");

		expect(source).not.toMatch(componentBarrelImport);
		expect(source).toContain('from "src/components/HasPermission";');
	});
});
