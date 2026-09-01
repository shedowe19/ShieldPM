"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { writeNotices } = require("./generate-notices.js");

const writeJson = (filename, value) => {
	fs.mkdirSync(path.dirname(filename), { recursive: true });
	fs.writeFileSync(filename, `${JSON.stringify(value)}\n`);
};

const createFixture = () => {
	const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-notices-"));
	for (const project of ["backend", "frontend"]) {
		writeJson(path.join(repositoryRoot, project, "package.json"), {
			dependencies: { "direct-package": "^1.0.0" },
			devDependencies: {},
		});
		writeJson(path.join(repositoryRoot, project, "node_modules", "direct-package", "package.json"), {
			name: "direct-package",
			version: "1.2.3",
			license: "MIT",
			dependencies: { "transitive-package": "1.0.0" },
		});
		writeJson(path.join(repositoryRoot, project, "node_modules", "transitive-package", "package.json"), {
			name: "transitive-package",
			version: "1.0.0",
			license: "Apache-2.0",
		});
	}
	return repositoryRoot;
};

test("writes deterministic notices for direct dependencies only", (context) => {
	const repositoryRoot = createFixture();
	context.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));

	const outputPath = path.join(repositoryRoot, "THIRD-PARTY-NOTICES.md");
	writeNotices(repositoryRoot, outputPath);
	const first = fs.readFileSync(outputPath, "utf8");
	writeNotices(repositoryRoot, outputPath);
	const second = fs.readFileSync(outputPath, "utf8");

	assert.equal(first, second);
	assert.match(first, /\[direct-package@1\.2\.3\].*MIT/);
	assert.doesNotMatch(first, /transitive-package@/);
});

test("preserves an existing notice file when package metadata is incomplete", (context) => {
	const repositoryRoot = createFixture();
	context.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));

	const outputPath = path.join(repositoryRoot, "THIRD-PARTY-NOTICES.md");
	fs.writeFileSync(outputPath, "previous verified notices\n");
	fs.unlinkSync(path.join(repositoryRoot, "frontend", "node_modules", "direct-package", "package.json"));

	assert.throws(() => writeNotices(repositoryRoot, outputPath), /Unable to read/);
	assert.equal(fs.readFileSync(outputPath, "utf8"), "previous verified notices\n");
});
