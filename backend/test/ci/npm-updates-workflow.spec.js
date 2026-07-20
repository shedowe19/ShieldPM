import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const workflow = fs.readFileSync(join(repoRoot, ".github/workflows/npm-updates.yml"), "utf8");

const updateSteps = (packageDirectory) => {
	const step = workflow.split(`      - name: Update ${packageDirectory} Dependencies\n`)[1];

	if (!step) {
		throw new Error(`Missing ${packageDirectory} dependency update step`);
	}

	return step.split("      - name:")[0];
};

describe("npm dependency update workflow", () => {
	it("requires full Git history before running the verification suite", () => {
		const checkout = workflow.split("      - name: Checkout Repository\n")[1].split("      - name:")[0];

		expect(checkout).toContain("fetch-depth: 0");
	});

	it("uses Yarn-based update tooling and fails when an update scan fails", () => {
		expect(workflow).toContain("yarn global add npm-check-updates@22.2.9");
		expect(workflow).not.toContain("npx npm-check-updates");
		expect(workflow).not.toContain("|| true");
		expect(updateSteps("Frontend")).toContain("yarn install --frozen-lockfile");
		expect(updateSteps("Backend")).toContain("yarn install --frozen-lockfile");
	});

	it("only creates a PR after a direct dependency manifest changed", () => {
		const changeCheck = workflow.split("        id: check_changes\n")[1].split("      - name:")[0];

		expect(changeCheck).toContain("git diff --quiet frontend/package.json backend/package.json");
		expect(changeCheck).not.toContain("frontend/yarn.lock backend/package.json backend/yarn.lock");
	});

	it("verifies updated dependencies before creating a pull request", () => {
		expect(workflow).toMatch(
			/Run dependency verification[\s\S]*backend[\s\S]*yarn test --run[\s\S]*frontend[\s\S]*yarn test --run[\s\S]*yarn build/,
		);
	});

	it("requires a dedicated PR token so automated pull requests trigger normal checks", () => {
		expect(workflow).toContain("DEPENDENCY_UPDATES_TOKEN");
		expect(workflow).toMatch(/token:\s*\$\{\{ secrets\.DEPENDENCY_UPDATES_TOKEN \}\}/);
	});
});
