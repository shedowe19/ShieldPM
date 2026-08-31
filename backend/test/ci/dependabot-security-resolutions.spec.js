import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

const packageVersions = (lockfilePath, packageName) => {
	const selector = new RegExp(`^\\"?${packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}@`);
	const versions = [];
	let selected = false;

	for (const line of fs.readFileSync(lockfilePath, "utf8").split("\n")) {
		if (line && !line.startsWith(" ") && !line.startsWith("\t") && line.endsWith(":")) {
			selected = selector.test(line);
			continue;
		}
		if (selected && /^\s+version(?::|\s)/.test(line)) {
			versions.push(
				line
					.trim()
					.replace(/^version(?::|\s+)\s*/, "")
					.replaceAll('"', ""),
			);
			selected = false;
		}
	}

	return [...new Set(versions)];
};

const versionAtLeast = (version, minimum) => {
	const actual = version.split(".").map(Number);
	const expected = minimum.split(".").map(Number);

	for (let index = 0; index < expected.length; index++) {
		if (actual[index] > expected[index]) return true;
		if (actual[index] < expected[index]) return false;
	}
	return true;
};

const assertPatched = (manifest, packageName, minimumVersion) => {
	const versions = packageVersions(join(repoRoot, manifest), packageName);

	expect(versions, `${manifest} must resolve ${packageName}`).not.toEqual([]);
	for (const version of versions) {
		expect(
			versionAtLeast(version, minimumVersion),
			`${manifest}: ${packageName}@${version} must be >= ${minimumVersion}`,
		).toBe(true);
	}
};

describe("Dependabot security resolutions", () => {
	it("keeps every resolved package above the current GitHub advisory fixed versions", () => {
		assertPatched("backend/yarn.lock", "axios", "1.18.0");
		assertPatched("backend/yarn.lock", "brace-expansion", "5.0.9");
		assertPatched("backend/yarn.lock", "fast-uri", "3.1.5");
		assertPatched("backend/yarn.lock", "js-yaml", "4.3.1");
		assertPatched("frontend/yarn.lock", "d3-color", "3.1.0");
	});
});
