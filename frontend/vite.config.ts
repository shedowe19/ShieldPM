import react from "@vitejs/plugin-react";
import type { PluginOption } from "vite";
import checker from "vite-plugin-checker";
import { defineConfig } from "vitest/config";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		checker({
			typescript: true,
		}),
	] as PluginOption[],
	resolve: {
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
		// The ShieldPM app shell intentionally carries the routing/layout and locale bootstrap.
		// Vendor chunks are split below; keep the warning threshold explicit so builds only warn on real growth.
		chunkSizeWarningLimit: 2400,
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
							[
								"@radix-ui/",
								"lucide-react/",
								"@tabler/icons-react/",
								"framer-motion/",
								"motion-dom/",
							].some((pkg) => id.includes(`node_modules/${pkg}`))
						) {
							return "vendor-ui";
						}
						if (
							["@tanstack/", "zod/", "react-hook-form/", "@hookform/"].some((pkg) =>
								id.includes(`node_modules/${pkg}`),
							)
						) {
							return "vendor-data";
						}
						if (
							["date-fns/", "dayjs/", "jwt-decode/", "i18next/", "react-i18next/", "react-intl/"].some(
								(pkg) => id.includes(`node_modules/${pkg}`),
							)
						) {
							return "vendor-utils";
						}
						if (
							["recharts/", "react-simple-maps/", "d3-geo/", "d3-scale/", "d3-color/"].some((pkg) =>
								id.includes(`node_modules/${pkg}`),
							)
						) {
							return "vendor-charts";
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
