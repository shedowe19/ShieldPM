import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const noticeGenerator = join(repoRoot, "scripts/generate-notices.js");
const temporaryDirectories = [];

const writeJson = (filename, value) => {
	fs.mkdirSync(dirname(filename), { recursive: true });
	fs.writeFileSync(filename, `${JSON.stringify(value)}\n`);
};

const createFixture = () => {
	const root = fs.mkdtempSync(join(tmpdir(), "shieldpm-notices-"));
	temporaryDirectories.push(root);
	fs.mkdirSync(join(root, "scripts"), { recursive: true });
	fs.copyFileSync(noticeGenerator, join(root, "scripts/generate-notices.js"));

	for (const project of ["backend", "frontend"]) {
		writeJson(join(root, project, "package.json"), {
			dependencies: { "fixture-package": "^1.0.0" },
			devDependencies: {},
		});
		writeJson(join(root, project, "node_modules", "fixture-package", "package.json"), {
			name: "fixture-package",
			version: "1.2.3",
			license: "MIT",
			dependencies: { "transitive-package": "9.9.9" },
		});
		writeJson(join(root, project, "node_modules", "transitive-package", "package.json"), {
			name: "transitive-package",
			version: "9.9.9",
			license: "Apache-2.0",
		});
	}

	return { noticesPath: join(root, "THIRD-PARTY-NOTICES.md"), root };
};

const executeGenerator = (fixture) =>
	spawnSync(process.execPath, [join(fixture.root, "scripts/generate-notices.js")], {
		cwd: fixture.root,
		encoding: "utf8",
	});

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { force: true, recursive: true });
	}
});

describe("third-party notice generator", () => {
	it("writes deterministic notices for installed direct dependencies only", () => {
		const fixture = createFixture();
		const firstResult = executeGenerator(fixture);
		expect(firstResult.status, firstResult.stderr).toBe(0);
		const first = fs.readFileSync(fixture.noticesPath, "utf8");

		const secondResult = executeGenerator(fixture);
		expect(secondResult.status, secondResult.stderr).toBe(0);
		const second = fs.readFileSync(fixture.noticesPath, "utf8");

		expect(second).toBe(first);
		expect(first).toContain("fixture-package@1.2.3");
		expect(first).not.toContain("transitive-package@9.9.9");
	});

	it("does not replace verified notices when installed metadata is missing", () => {
		const fixture = createFixture();
		fs.writeFileSync(fixture.noticesPath, "# Existing verified notices\n");
		fs.unlinkSync(join(fixture.root, "frontend", "node_modules", "fixture-package", "package.json"));

		const result = executeGenerator(fixture);
		expect(result.status).not.toBe(0);
		expect(fs.readFileSync(fixture.noticesPath, "utf8")).toBe("# Existing verified notices\n");
	});
});
