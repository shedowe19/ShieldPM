import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const readManifest = (directory) => JSON.parse(fs.readFileSync(join(repoRoot, directory, "package.json"), "utf8"));
const readYarnConfig = (directory) => fs.readFileSync(join(repoRoot, directory, ".yarnrc.yml"), "utf8");

describe("npm and Yarn dependency constraints", () => {
	it("pins only remaining vulnerable backend transitive paths and removes obsolete frontend overrides", () => {
		expect(readManifest("backend").resolutions).toEqual({
			"axios@npm:1.16.0": "1.18.0",
			"brace-expansion@npm:^5.0.5": "5.0.9",
			"fast-uri@npm:^3.0.1": "3.1.5",
			"js-yaml@npm:^4.1.0": "4.3.1",
			"nanoid@npm:^3.3.16": "3.3.18",
		});
		expect(readManifest("frontend").resolutions).toBeUndefined();
	});

	it("does not use broad overrides that could hide incompatible major upgrades", () => {
		for (const directory of ["backend", "frontend"]) {
			const manifest = readManifest(directory);
			expect(manifest, `${directory} must not declare npm overrides`).not.toHaveProperty("overrides");
			for (const key of Object.keys(manifest.resolutions ?? {})) {
				expect(key).not.toBe("**");
			}
		}
	});

	it("quarantines newly published packages and disables unreviewed install scripts", () => {
		for (const directory of ["backend", "frontend"]) {
			const config = readYarnConfig(directory);
			expect(config).toMatch(/^enableScripts:\s*false$/m);
			expect(config).toMatch(/^npmMinimalAgeGate:\s*1440$/m);
		}
	});
});
