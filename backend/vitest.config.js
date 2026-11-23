import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		setupFiles: ["./test/helpers/setup-data-path.js"],
	},
});
