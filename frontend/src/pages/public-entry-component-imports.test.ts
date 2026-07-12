import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicEntryFiles = ["src/pages/Login/index.tsx", "src/pages/Setup/index.tsx"];
const componentBarrelImport = /from ["']src\/components(?:\/index)?["']/;

describe("public entry component dependencies", () => {
	it("loads language and theme controls without the shared component barrel", () => {
		for (const file of publicEntryFiles) {
			const source = readFileSync(resolve(process.cwd(), file), "utf8");

			expect(source).not.toMatch(componentBarrelImport);
			expect(source).toContain('from "src/components/LocalePicker";');
			expect(source).toContain('from "src/components/ThemeSwitcher";');
		}
	});
});
