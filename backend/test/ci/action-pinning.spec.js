import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const workflowsDirectory = join(repoRoot, ".github", "workflows");
const workflowFiles = fs.readdirSync(workflowsDirectory).filter((name) => /\.ya?ml$/.test(name));

const actionReferences = workflowFiles.flatMap((name) => {
	const workflow = fs.readFileSync(join(workflowsDirectory, name), "utf8");
	return [...workflow.matchAll(/^\s*(?:-\s+)?uses:\s*([^@\s#]+)@([^\s#]+)/gm)].map((match) => ({
		file: name,
		action: match[1],
		ref: match[2],
	}));
});

describe("GitHub Actions supply chain", () => {
	it("pins every remote action to a full commit SHA", () => {
		const remoteReferences = actionReferences.filter(({ action }) => !action.startsWith("./"));

		expect(remoteReferences.length).toBeGreaterThan(0);
		for (const { action, file, ref } of remoteReferences) {
			expect(ref, `${file}: ${action} must use an immutable full commit SHA`).toMatch(/^[0-9a-f]{40}$/);
		}
	});

	it("lets Dependabot keep GitHub Action pins current", () => {
		const dependabot = fs.readFileSync(join(repoRoot, ".github", "dependabot.yml"), "utf8");

		expect(dependabot).toMatch(/package-ecosystem:\s*["']?github-actions["']?/);
		expect(dependabot).toContain("interval: weekly");
	});
});
