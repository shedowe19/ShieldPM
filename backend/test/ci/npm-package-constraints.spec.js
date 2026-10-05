import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const readManifest = (directory) => JSON.parse(fs.readFileSync(join(repoRoot, directory, "package.json"), "utf8"));

describe("npm and Yarn dependency constraints", () => {
	it("pins only remaining vulnerable backend transitive paths and removes obsolete frontend overrides", () => {
		expect(readManifest("backend").resolutions).toEqual({
			"@apidevtools/swagger-parser/**/js-yaml": "4.3.2",
			"@duosecurity/duo_universal/axios": "1.20.0",
			"ajv/fast-uri": "3.1.8",
			"archiver/**/brace-expansion": "5.0.12",
			"dockerode/@grpc/grpc-js": "1.14.5",
			"express/**/qs": "6.16.0",
			"express-rate-limit/ip-address": "10.7.3",
			"proxy-agent/**/ip-address": "10.7.3",
			"vitest/vite/postcss/nanoid": "3.3.18",
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
});
