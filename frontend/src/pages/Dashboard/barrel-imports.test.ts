import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dashboardRouteFiles = [
	"src/pages/Dashboard/index.tsx",
	"src/pages/Dashboard/CertificateExpiryWidget.tsx",
	"src/pages/Dashboard/DashboardNotesWidget.tsx",
	"src/pages/Dashboard/TopHostsWidget.tsx",
];
const componentBarrelImport = /from ["']src\/components(?:\/index)?["']/;
const hookBarrelImport = /from ["']src\/hooks(?:\/index)?["']/;

describe("dashboard route dependencies", () => {
	it("does not pull shared component or hook barrels into the landing route", () => {
		for (const file of dashboardRouteFiles) {
			const source = readFileSync(resolve(process.cwd(), file), "utf8");
			expect(source).not.toMatch(componentBarrelImport);
			expect(source).not.toMatch(hookBarrelImport);
		}
	});

	it("loads one selectable host ranking on the landing route instead of five parallel queries", () => {
		const source = readFileSync(resolve(process.cwd(), "src/pages/Dashboard/index.tsx"), "utf8");

		expect(source).toContain("<TopHostsRankingsWidget />");
		expect(source).not.toContain('<TopHostsWidget sort="bytes" />');
		expect(source).not.toContain('<TopHostsWidget sort="client_errors" />');
		expect(source).not.toContain('<TopHostsWidget sort="response_time" />');
	});
});
