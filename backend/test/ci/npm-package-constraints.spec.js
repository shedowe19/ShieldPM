import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const readManifest = (directory) => JSON.parse(fs.readFileSync(join(repoRoot, directory, "package.json"), "utf8"));

describe("npm and Yarn dependency constraints", () => {
	it("leaves package manager constraint maps absent during the unpinned compatibility test", () => {
		for (const directory of ["backend", "frontend"]) {
			const manifest = readManifest(directory);

			expect(manifest, `${directory} must not declare Yarn resolutions`).not.toHaveProperty("resolutions");
			expect(manifest, `${directory} must not declare npm overrides`).not.toHaveProperty("overrides");
		}
	});
});
