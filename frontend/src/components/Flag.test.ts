import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const localeFlagCodes = ["BG", "CN", "DE", "ES", "GB", "IT", "JP", "KR", "NL", "PL", "RU", "SK", "VN"];

describe("Flag bundle dependencies", () => {
	it("imports only the flags used by supported locales instead of the complete flag barrel", () => {
		const source = readFileSync(resolve(process.cwd(), "src/components/Flag.tsx"), "utf8");

		expect(source).not.toContain('from "country-flag-icons/react/3x2"');
		for (const countryCode of localeFlagCodes) {
			expect(source).toContain(`country-flag-icons/react/3x2/${countryCode}`);
		}
	});

	it("limits dynamic flag lookup to direct locale flag entries", () => {
		const source = readFileSync(resolve(process.cwd(), "src/components/Flag.tsx"), "utf8");

		expect(source).toContain("Object.getOwnPropertyDescriptor(localeFlags, countryCode)");
	});
});
