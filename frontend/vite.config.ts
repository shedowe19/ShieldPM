import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";
import tsconfigPaths from "vite-tsconfig-paths";
import "vitest/config";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
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
						// 1. Specific heavy libraries first
						if (id.includes("@tanstack")) return "vendor-tanstack";
						if (id.includes("@radix-ui") || id.includes("framer-motion")) return "vendor-ui";
						if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
						if (id.includes("xterm")) return "vendor-terminal";
						if (id.includes("@uiw/react-textarea-code-editor") || id.includes("refractor") || id.includes("prismjs")) return "vendor-editor";
						if (id.includes("lucide-react") || id.includes("@tabler/icons-react") || id.includes("country-flag-icons")) return "vendor-icons";
						if (id.includes("react-simple-maps") || id.includes("i18n-iso-countries")) return "vendor-maps";
						if (id.includes("react-hook-form") || id.includes("formik") || id.includes("@hookform") || id.includes("zod")) return "vendor-form";
						if (id.includes("react-select") || id.includes("react-input-autosize")) return "vendor-select";
						if (id.includes("react-markdown") || id.includes("remark-") || id.includes("rehype-") || id.includes("micromark") || id.includes("unist-") || id.includes("vfile") || id.includes("mdast-")) return "vendor-markdown";

						// 2. Utils
						if (id.includes("dayjs") || id.includes("i18next") || id.includes("ua-parser-js") || id.includes("date-fns") || id.includes("axios")) return "vendor-utils";

						// 3. React Core (Must be last to avoid catching lucide-react etc.)
						if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/react-router/") || id.includes("/react-router-dom/")) return "vendor-react";
						// Fallback for direct "react" package which might not have slashes in ID depending on version, but usually node_modules/react/...
						if (id.match(/\/react\//)) return "vendor-react";

						// 4. Misc
						return "vendor-misc";
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
