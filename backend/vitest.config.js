import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		setupFiles: ["./test/helpers/setup-data-path.js"],
		coverage: {
			provider: "v8",
			reporter: ["text-summary"],
			include: ["app.js", "lib/**/*.js", "internal/**/*.js", "models/**/*.js", "routes/**/*.js"],
			exclude: ["**/*.test.js", "**/*.spec.js"],
			thresholds: {
				branches: 30,
				functions: 30,
				lines: 40,
				statements: 40,
			},
		},
	},
});
