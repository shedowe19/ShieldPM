import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const featureScopedMotionFiles = [
	"src/components/AnimatedPage.tsx",
	"src/components/Button.tsx",
	"src/components/Table/TableBody.tsx",
	"src/pages/Dashboard/index.tsx",
];

describe("Framer Motion feature loading", () => {
	it("keeps the full motion feature set out of the authenticated app shell", () => {
		const router = readSource("src/Router.tsx");
		const tableBody = readSource("src/components/Table/TableBody.tsx");

		expect(router).toContain('import { AnimatePresence, domAnimation, LazyMotion } from "framer-motion";');
		expect(router).toContain("<LazyMotion features={domAnimation}>");
		expect(tableBody).toContain('import { AnimatePresence, domAnimation, LazyMotion, m } from "framer-motion";');
		expect(tableBody).toContain("<LazyMotion features={domAnimation}>");
		expect(tableBody).not.toMatch(/\n\s*layout\n/);

		for (const path of featureScopedMotionFiles) {
			const source = readSource(path);

			expect(source).toMatch(/import\s*\{[^}]*\bm\b[^}]*\}\s*from "framer-motion"/);
			expect(source).not.toMatch(/\bmotion\./);
		}
	});
});
