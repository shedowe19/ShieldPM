import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 1,
  timeout: 30000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "cd ../backend && node index.js",
      port: 3000,
      timeout: 30000,
      reuseExistingServer: true,
      env: {
        NODE_ENV: "development",
        DB_SQLITE_FILE: "./data/e2e-test.sqlite",
      },
    },
    {
      command: "npx vite --port 5173",
      port: 5173,
      timeout: 30000,
      reuseExistingServer: true,
    },
  ],
});
