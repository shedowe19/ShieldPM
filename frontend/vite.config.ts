import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";
import { configDefaults } from "vitest/config";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		checker({
			typescript: true,
		}),
	],
	resolve: {
		alias: {
			src: resolve(process.cwd(), "src"),
			"@": resolve(process.cwd(), "src"),
			test: resolve(process.cwd(), "test"),
		},
		tsconfigPaths: true,
	},
	server: {
		host: true,
		port: 5173,
		strictPort: true,
		proxy: {
			"/api": {
				target: "http://localhost:3000",
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, ""),
			},
		},
	},
	build: {
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes("node_modules")) {
						if (
							["react/", "react-dom/", "react-router-dom/"].some((pkg) =>
								id.includes(`node_modules/${pkg}`),
							)
						) {
							return "vendor-react";
						}

						if (
							["@tanstack/react-query/", "@tanstack/query-core/"].some((pkg) =>
								id.includes(`node_modules/${pkg}`),
							)
						) {
							return "vendor-query";
						}

						if (id.includes("node_modules/@tanstack/react-table/")) {
							return "vendor-table";
						}

						if (
							["date-fns/", "dayjs/", "jwt-decode/", "i18next/", "react-i18next/", "react-intl/"].some(
								(pkg) => id.includes(`node_modules/${pkg}`),
							)
						) {
							return "vendor-utils";
						}
					}
				},
			},
		},
	},

	test: {
		environment: "happy-dom",
		exclude: [...configDefaults.exclude, "e2e/**"],
		setupFiles: ["./vitest-setup.js"],
	},
	assetsInclude: ["**/*.md", "**/*.png", "**/*.svg"],
});
