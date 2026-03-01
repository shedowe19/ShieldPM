import react from "@vitejs/plugin-react";
import vike from "vike/plugin";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";
import tsconfigPaths from "vite-tsconfig-paths";
import "vitest/config";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		vike(),
		checker({
			typescript: true,
		}),
		tsconfigPaths(),
	],
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
						if (id.includes("react") || id.includes("react-dom") || id.includes("react-router-dom")) {
							return "vendor-react";
						}
						if (
							id.includes("@radix-ui") ||
							id.includes("lucide-react") ||
							id.includes("@tabler/icons-react") ||
							id.includes("framer-motion")
						) {
							return "vendor-ui";
						}
						if (
							id.includes("@tanstack") ||
							id.includes("zod") ||
							id.includes("react-hook-form") ||
							id.includes("@hookform")
						) {
							return "vendor-data";
						}
						if (
							id.includes("date-fns") ||
							id.includes("dayjs") ||
							id.includes("jwt-decode") ||
							id.includes("i18next") ||
							id.includes("react-i18next") ||
							id.includes("react-intl")
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
		setupFiles: ["./vitest-setup.js"],
	},
	assetsInclude: ["**/*.md", "**/*.png", "**/*.svg"],
});
