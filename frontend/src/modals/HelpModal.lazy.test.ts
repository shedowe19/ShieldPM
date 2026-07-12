import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("HelpModal markdown dependency", () => {
	it("keeps help content out of the dialog entry chunk while preloading it for the user action", () => {
		const source = readSource("src/modals/HelpModal.tsx");

		expect(source).not.toContain('import ReactMarkdown from "react-markdown"');
		expect(source).not.toContain('import { getHelpFile } from "src/locale/HelpDoc"');
		expect(source).toContain('import { HelpContentBoundary } from "./HelpContentBoundary"');
		expect(source).toContain("const HelpContent = lazy(loadHelpContent);");
		expect(source).toContain("void loadHelpContent().catch(() => undefined);");
		expect(source).toContain("<HelpContentBoundary>");
	});
});
