import { cn as srcCn } from "src/lib/utils";
import { describe, expect, it } from "vitest";
import config from "./vite.config";
import { cn as atCn } from "@/lib/utils";

const getManualChunk = (id: string) => {
	const output = config.build?.rollupOptions?.output;
	if (!output || Array.isArray(output) || typeof output.manualChunks !== "function") {
		throw new Error("Vite manual chunk configuration is unavailable");
	}

	return output.manualChunks(id, {} as never);
};

describe("Vite configuration", () => {
	it("enables Vite's native tsconfig path resolver for both source aliases", () => {
		expect(config.resolve?.tsconfigPaths).toBe(true);
		expect(srcCn("flex", "flex-col")).toBe("flex flex-col");
		expect(atCn("hidden", "block")).toBe("block");
	});
});

describe("Vite chunking", () => {
	it("keeps UI dependencies out of a shared app-shell vendor chunk", () => {
		expect(getManualChunk("/workspace/node_modules/@radix-ui/react-select/dist/index.mjs")).toBeUndefined();
		expect(getManualChunk("/workspace/node_modules/lucide-react/dist/cjs/lucide-react.js")).toBeUndefined();
		expect(
			getManualChunk("/workspace/node_modules/@tabler/icons-react/dist/esm/tabler-icons-react.mjs"),
		).toBeUndefined();
		expect(getManualChunk("/workspace/node_modules/framer-motion/dist/es/index.mjs")).toBeUndefined();
		expect(getManualChunk("/workspace/node_modules/motion-dom/dist/es/index.mjs")).toBeUndefined();
	});

	it("keeps route-only form dependencies out of an explicit app-shell vendor chunk", () => {
		expect(getManualChunk("/workspace/node_modules/@tanstack/react-query/build/modern/index.js")).toBe(
			"vendor-query",
		);
		expect(getManualChunk("/workspace/node_modules/@tanstack/react-table/build/lib/index.mjs")).toBe(
			"vendor-table",
		);
		expect(getManualChunk("/workspace/node_modules/react-hook-form/dist/index.esm.mjs")).toBeUndefined();
		expect(getManualChunk("/workspace/node_modules/@hookform/resolvers/zod/dist/zod.mjs")).toBeUndefined();
		expect(getManualChunk("/workspace/node_modules/zod/v4/core/index.js")).toBeUndefined();
	});
});
