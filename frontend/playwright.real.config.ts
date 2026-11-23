import { defineConfig, devices } from "@playwright/test";

// A real Express/SQLite backend is started by the script; only the Nginx
// binary is a stub. The Vite dev server proxies /api to it.
export default defineConfig({
	testDir: "./e2e-real",
	fullyParallel: false,
	retries: 0,
	reporter: "list",
	timeout: 90_000,
	use: {
		baseURL: "http://127.0.0.1:4173",
		locale: "en-US",
		screenshot: "only-on-failure",
		serviceWorkers: "block",
		trace: "retain-on-failure",
	},
	webServer: {
		command: "bash ../scripts/ci/start-e2e-real.sh",
		url: "http://127.0.0.1:4173",
		reuseExistingServer: false,
		timeout: 180_000,
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
