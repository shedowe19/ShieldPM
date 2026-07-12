import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSmokePath = resolve(process.cwd(), "e2e/app-smoke.spec.ts");
const configPath = resolve(process.cwd(), "playwright.config.ts");

describe("Playwright smoke configuration", () => {
	it("starts an isolated local server and blocks service workers", () => {
		const configSource = readFileSync(configPath, "utf8");

		expect(configSource).toContain("node_modules/.bin/vite build && node_modules/.bin/vite preview");
		expect(configSource).toContain("reuseExistingServer: false");
		expect(configSource).toContain('locale: "en-US"');
		expect(configSource).toContain('serviceWorkers: "block"');
	});

	it("keeps browser request handling fail-closed outside the local test origin", () => {
		const appSmokeSource = readFileSync(appSmokePath, "utf8");

		expect(appSmokeSource).toContain('await route.abort("blockedbyclient")');
		expect(appSmokeSource).not.toContain("return route.fallback()");
		expect(appSmokeSource).toMatch(/page\.routeWebSocket\(\s*"\*\*",\s*\(webSocket\)\s*=>\s*webSocket\.close/);
	});
});
