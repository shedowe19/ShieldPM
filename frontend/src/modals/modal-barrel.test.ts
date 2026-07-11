import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const modalBarrelPath = resolve(process.cwd(), "src/modals/index.ts");

describe("modal module boundaries", () => {
	it("does not retain an unused static modal barrel", () => {
		expect(existsSync(modalBarrelPath)).toBe(false);
	});
});
