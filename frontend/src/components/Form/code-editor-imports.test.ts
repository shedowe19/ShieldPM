import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("code editor form dependencies", () => {
	it("keeps code editor fields out of the shared form barrel", () => {
		const formBarrel = readSource("src/components/Form/index.ts");

		expect(formBarrel).not.toContain('export * from "./LocationsFields"');
		expect(formBarrel).not.toContain('export * from "./NginxConfigField"');
	});

	it("loads code editor fields directly in the host forms that need them", () => {
		expect(readSource("src/modals/DeadHostModal.tsx")).toContain(
			'import { NginxConfigField } from "src/components/Form/NginxConfigField"',
		);
		expect(readSource("src/modals/ProxyHostFormTabs.tsx")).toContain(
			'import { LocationsFields } from "src/components/Form/LocationsFields"',
		);
		expect(readSource("src/modals/RedirectionHostModal.tsx")).toContain(
			'import { NginxConfigField } from "src/components/Form/NginxConfigField"',
		);
	});

	it("defers conditional code editors until their controls render", () => {
		const lazyCodeEditorPath = resolve(process.cwd(), "src/components/LazyCodeEditor.tsx");
		expect(existsSync(lazyCodeEditorPath)).toBe(true);

		if (!existsSync(lazyCodeEditorPath)) return;

		expect(readSource("src/components/LazyCodeEditor.tsx")).toContain(
			'lazy(() => import("@uiw/react-textarea-code-editor"))',
		);

		for (const file of [
			"src/components/Form/LocationsFields.tsx",
			"src/components/Form/NginxConfigField.tsx",
			"src/modals/EventDetailsModal.tsx",
			"src/pages/Settings/DefaultSite.tsx",
		]) {
			const source = readSource(file);
			expect(source).toContain('import { LazyCodeEditor } from "src/components/LazyCodeEditor"');
			expect(source).not.toContain('import CodeEditor from "@uiw/react-textarea-code-editor"');
			expect(source).toContain("<LazyCodeEditor");
		}
	});
});
