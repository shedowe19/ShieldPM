import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const readManifest = (directory) => JSON.parse(fs.readFileSync(join(repoRoot, directory, "package.json"), "utf8"));

describe("npm and Yarn dependency constraints", () => {
	it("pins only vulnerable transitive dependency paths while their direct parents remain unpatched", () => {
		expect(readManifest("backend").resolutions).toEqual({
			"@apidevtools/swagger-parser/**/js-yaml": "4.3.1",
			"@duosecurity/duo_universal/axios": "1.18.0",
			"ajv/fast-uri": "3.1.5",
			"archiver/**/brace-expansion": "5.0.9",
		});
		expect(readManifest("frontend").resolutions).toEqual({
			"react-simple-maps/**/d3-color": "3.1.0",
		});
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
});
