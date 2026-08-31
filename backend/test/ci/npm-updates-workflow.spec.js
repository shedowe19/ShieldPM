import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const workflow = fs.readFileSync(join(repoRoot, ".github/workflows/npm-updates.yml"), "utf8");

const namedStep = (name) => {
	const step = workflow.split(`      - name: ${name}\n`)[1];
	if (!step) throw new Error(`Missing ${name} step`);
	return step.split("      - name:")[0];
};

describe("npm dependency update workflow", () => {
	it("only runs after an explicit operator request", () => {
		expect(workflow).toMatch(/on:\n\s+workflow_dispatch:/);
		expect(workflow).not.toContain("schedule:");
		expect(workflow).not.toContain("push:");
		expect(workflow).toMatch(/permissions:\n\s+contents: read/);
		expect(workflow).not.toContain("contents: write");
	});

	it("pins actions and the Node, Corepack, and Yarn toolchain", () => {
		expect(workflow).toContain("node-version: 24.20.0");
		expect(workflow).toContain("COREPACK_VERSION: 0.36.0");
		expect(workflow).toContain("YARN_VERSION: 4.18.0");
		expect(workflow).not.toContain("yarn@1.22.22");
		expect(workflow).toContain("npm install --global --ignore-scripts");
		for (const line of workflow.split("\n").filter((candidate) => candidate.trim().startsWith("uses:"))) {
			expect(line).toMatch(/@[0-9a-f]{40}(?:\s+#.*)?$/);
		}
	});

	it("updates the complete dependency line and recreates immutable deduplicated lockfiles", () => {
		for (const project of ["frontend", "backend"]) {
			const step = namedStep(`Update ${project} dependencies`);
			expect(step).toContain("ncu --upgrade --target latest");
			expect(step).toContain("yarn install");
			expect(step).toContain("yarn dedupe --strategy highest");
			expect(step).toContain("yarn install --immutable");
			expect(step).not.toContain("|| true");
		}
	});

	it("generates notices and runs all fail-closed verification gates", () => {
		expect(workflow).toContain("node --test scripts/generate-notices.test.js");
		expect(workflow).toContain("node scripts/generate-notices.js");
		const verification = namedStep("Run dependency verification");
		for (const gate of [
			"backend check",
			"backend tsc --noEmit",
			"backend test --run",
			"frontend check",
			"frontend tsc --noEmit",
			"frontend test --run",
			"frontend build",
			"npm audit --recursive --severity high",
			"git diff --check",
		]) {
			expect(verification).toContain(gate);
		}
		expect(workflow).not.toContain("continue-on-error");
		expect(workflow).not.toContain("license-checker");
	});

	it("creates a pull request only after a direct manifest change and requires the dedicated token", () => {
		const changeCheck = workflow.split("        id: check_changes\n")[1].split("      - name:")[0];
		expect(changeCheck).toContain("git diff --quiet -- frontend/package.json backend/package.json");
		expect(workflow).toContain("DEPENDENCY_UPDATES_TOKEN");
		expect(workflow).toMatch(/token:\s*\$\{\{ secrets\.DEPENDENCY_UPDATES_TOKEN \}\}/);
	});
});
