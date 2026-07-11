import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const obsoleteModalModulePaths = ["src/modals/index.ts", "src/modals/lazy.ts"].map((path) =>
	resolve(process.cwd(), path),
);

describe("modal module boundaries", () => {
	it("does not retain unused shared modal loader modules", () => {
		for (const modalModulePath of obsoleteModalModulePaths) {
			expect(existsSync(modalModulePath)).toBe(false);
		}
	});
});
