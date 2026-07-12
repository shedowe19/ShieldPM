import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const workflow = fs.readFileSync(join(repoRoot, ".github/workflows/spellcheck.yml"), "utf8");

const configuredIgnoreWords = () => {
	const match = workflow.match(/^\s*ignore_words_list:\s*(.+)$/m);

	if (!match) {
		throw new Error("Spellcheck workflow must configure an ignore word list");
	}

	return match[1].split(",");
};

describe("spellcheck workflow", () => {
	it("allows German localization assertions without skipping their test files", () => {
		expect(configuredIgnoreWords()).toEqual(expect.arrayContaining(["Methode", "Funktion", "als", "oder"]));
		expect(workflow).not.toContain("frontend/src/components/Nginx/WireguardConfigModal.test.tsx");
		expect(workflow).not.toContain("frontend/src/pages/Nginx/CloudflaredTunnels.test.tsx");
		expect(workflow).not.toContain("frontend/src/pages/Analytics/index.test.tsx");
	});
});
