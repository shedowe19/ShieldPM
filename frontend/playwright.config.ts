import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	forbidOnly: Boolean(process.env.CI),
	fullyParallel: false,
	retries: 0,
	reporter: "list",
	use: {
		baseURL: "http://127.0.0.1:4173",
		locale: "en-US",
		screenshot: "only-on-failure",
		serviceWorkers: "block",
		trace: "retain-on-failure",
	},
	webServer: {
		command:
			"node_modules/.bin/vite build && node_modules/.bin/vite preview --host 127.0.0.1 --port 4173 --strictPort",
		url: "http://127.0.0.1:4173",
		reuseExistingServer: false,
		timeout: 120_000,
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
