import { cn as srcCn } from "src/lib/utils";
import { describe, expect, it } from "vitest";
import config from "./vite.config";
import { cn as atCn } from "@/lib/utils";

describe("Vite configuration", () => {
	it("enables Vite's native tsconfig path resolver for both source aliases", () => {
		expect(config.resolve?.tsconfigPaths).toBe(true);
		expect(srcCn("flex", "flex-col")).toBe("flex flex-col");
		expect(atCn("hidden", "block")).toBe("block");
	});
});
