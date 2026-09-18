import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const scriptPath = backendSourcePath("..", "frontend", "scripts", "ci", "check-bundle-budget.cjs");
const temporaryDirectories = [];

const createFixture = ({ budget, files }) => {
	const root = fs.mkdtempSync(join(tmpdir(), "shieldpm-bundle-budget-"));
	temporaryDirectories.push(root);
	const dist = join(root, "dist");
	const assets = join(dist, "assets");
	fs.mkdirSync(assets, { recursive: true });
	for (const [name, content] of Object.entries(files)) {
		fs.writeFileSync(join(assets, name), content);
	}
	const budgetPath = join(root, "budget.json");
	fs.writeFileSync(budgetPath, JSON.stringify(budget));
	return { budgetPath, dist };
};

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { force: true, recursive: true });
	}
});

describe("compressed frontend bundle budget", () => {
	it("accepts a dist directory whose compressed assets remain within every configured budget", () => {
		const fixture = createFixture({
			budget: { gzip: { largestJavaScriptBytes: 1024, totalJavaScriptBytes: 2048, totalStylesheetBytes: 1024 } },
			files: { "app.js": "console.log('shieldpm');\n", "app.css": "body { color: #123456; }\n" },
		});
		const result = spawnSync(
			process.execPath,
			[scriptPath, "--dist", fixture.dist, "--budget", fixture.budgetPath],
			{
				encoding: "utf8",
			},
		);

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("bundle_budget=PASS");
	});

	it("fails when a compressed JavaScript asset exceeds its configured budget", () => {
		const fixture = createFixture({
			budget: { gzip: { largestJavaScriptBytes: 1, totalJavaScriptBytes: 2048, totalStylesheetBytes: 1024 } },
			files: { "app.js": "console.log('shieldpm');\n" },
		});
		const result = spawnSync(
			process.execPath,
			[scriptPath, "--dist", fixture.dist, "--budget", fixture.budgetPath],
			{
				encoding: "utf8",
			},
		);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("largestJavaScriptBytes");
	});
});
