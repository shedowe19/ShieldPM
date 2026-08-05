import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const readManifest = (directory) => JSON.parse(fs.readFileSync(join(repoRoot, directory, "package.json"), "utf8"));

describe("npm and Yarn dependency constraints", () => {
	it("pins only audited backend transitives and avoids unreviewed override maps", () => {
		const backendManifest = readManifest("backend");
		const frontendManifest = readManifest("frontend");

		expect(backendManifest.resolutions).toEqual({
			axios: "1.19.0",
			"brace-expansion": "5.0.9",
			"fast-uri": "3.1.5",
		});
		expect(backendManifest).not.toHaveProperty("overrides");
		expect(frontendManifest).not.toHaveProperty("resolutions");
		expect(frontendManifest).not.toHaveProperty("overrides");
	});
});
