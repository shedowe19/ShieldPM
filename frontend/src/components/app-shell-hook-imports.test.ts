import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appShellHookConsumers = [
	"src/Router.tsx",
	"src/components/HasPermission.tsx",
	"src/components/SiteFooter.tsx",
	"src/components/SiteHeader.tsx",
	"src/components/ThemeSwitcher.tsx",
];
const hooksBarrelImport = /from ["']src\/hooks(?:\/index)?["']/;

describe("app shell hook dependencies", () => {
	it("does not pull the shared hooks barrel into the initial application shell", () => {
		for (const file of appShellHookConsumers) {
			const source = readFileSync(resolve(process.cwd(), file), "utf8");
			expect(source).not.toMatch(hooksBarrelImport);
		}
	});
});
