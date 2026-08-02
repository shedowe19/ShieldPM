import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const synchronizer = join(repoRoot, "scripts/sync-verified-dependency-docs.js");
const temporaryDirectories = [];

const writePackage = (directory, name, version) => {
	fs.mkdirSync(directory, { recursive: true });
	fs.writeFileSync(join(directory, "package.json"), JSON.stringify({ main: "index.js", name, version }));
	fs.writeFileSync(join(directory, "index.js"), "module.exports = {};\n");
};

const createFixture = ({ includeMarker = true, vitestViteVersion } = {}) => {
	const root = fs.mkdtempSync(join(tmpdir(), "shieldpm-verified-dependencies-"));
	temporaryDirectories.push(root);
	const frontendDirectory = join(root, "frontend");
	const nodeModulesDirectory = join(frontendDirectory, "node_modules");
	const documentationPath = join(root, "docs/wiki-intern/entwicklung/tests.md");

	fs.mkdirSync(frontendDirectory, { recursive: true });
	fs.mkdirSync(join(root, "docs/wiki-intern/entwicklung"), { recursive: true });
	fs.writeFileSync(join(frontendDirectory, "package.json"), JSON.stringify({ devDependencies: { vite: "8.2.0" } }));
	writePackage(join(nodeModulesDirectory, "vite"), "vite", "8.2.0");
	writePackage(join(nodeModulesDirectory, "vitest"), "vitest", "4.1.10");
	writePackage(join(nodeModulesDirectory, "rolldown"), "rolldown", "1.2.1");

	if (vitestViteVersion) {
		writePackage(join(nodeModulesDirectory, "vitest/node_modules/vite"), "vite", vitestViteVersion);
	}

	fs.writeFileSync(
		documentationPath,
		includeMarker
			? [
					"# Tests",
					"",
					"<!-- verified-vite-baseline:start -->Vite und Vitest verwenden gemeinsam Vite 8.1.5/Rolldown 1.1.5.<!-- verified-vite-baseline:end -->",
					"",
				].join("\n")
			: "# Tests\n",
	);

	return { documentationPath, root };
};

const synchronize = (fixture) =>
	spawnSync(process.execPath, [synchronizer, "--root", fixture.root], { encoding: "utf8" });

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { force: true, recursive: true });
	}
});

describe("verified dependency documentation synchronizer", () => {
	it("records the Vite and Rolldown versions resolved from the installed frontend tree", () => {
		const fixture = createFixture();
		const result = synchronize(fixture);

		expect(result.status, result.stderr).toBe(0);
		expect(fs.readFileSync(fixture.documentationPath, "utf8")).toContain(
			"Vite und Vitest verwenden gemeinsam Vite 8.2.0/Rolldown 1.2.1.",
		);
	});

	it("fails closed instead of editing unmarked documentation", () => {
		const fixture = createFixture({ includeMarker: false });
		const result = synchronize(fixture);

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("verified Vite baseline marker");
	});

	it("fails when Vitest resolves a different Vite package than the direct dependency", () => {
		const fixture = createFixture({ vitestViteVersion: "8.1.5" });
		const originalDocumentation = fs.readFileSync(fixture.documentationPath, "utf8");
		const result = synchronize(fixture);

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("Vitest resolves Vite 8.1.5 instead of Vite 8.2.0");
		expect(fs.readFileSync(fixture.documentationPath, "utf8")).toBe(originalDocumentation);
	});
});
