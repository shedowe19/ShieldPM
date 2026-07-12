import { readFileSync } from "node:fs";
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
});
