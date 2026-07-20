import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const readManifest = (directory) => JSON.parse(fs.readFileSync(join(repoRoot, directory, "package.json"), "utf8"));

const assertNoOpenMajorResolution = (manifest) => {
	for (const [dependency, range] of Object.entries(manifest.resolutions || {})) {
		expect(range, `${dependency} must not use an open >= resolution`).not.toMatch(/^>=/);
	}
	for (const [dependency, range] of Object.entries(manifest.overrides || {})) {
		if (typeof range !== "string") continue;
		expect(range, `${dependency} must not use an open >= override`).not.toMatch(/^>=/);
	}
};

describe("npm and Yarn dependency constraints", () => {
	it("pins security resolutions below their next major version", () => {
		assertNoOpenMajorResolution(readManifest("backend"));
		assertNoOpenMajorResolution(readManifest("frontend"));
	});

	it("keeps npm overrides compatible with their direct dependencies", () => {
		const backend = readManifest("backend");
		const frontend = readManifest("frontend");

		expect(backend.overrides["js-yaml"]).toBe("$js-yaml");
		expect(frontend.overrides.vite).toBe("$vite");
		expect(frontend.overrides.postcss).toBe("$postcss");
	});
});
