import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const workflowPath = join(repoRoot, ".github/workflows/lint-and-format.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");
const comparisonBaseScript = workflow
	.split("      - name: Resolve comparison base\n")[1]
	.split("\n      - name: Check changed lines")[0]
	.split("        run: |\n")[1]
	.replace(/^ {10}/gm, "");

const githubExpression = (expression) => ["$", "{", "{ ", expression, " }}"].join("");

const resolveComparisonBase = (eventName, before, defaultBranch = "develop") => {
	const outputDirectory = fs.mkdtempSync(join(tmpdir(), "shieldpm-workflow-"));
	const outputPath = join(outputDirectory, "github-output");
	const script = comparisonBaseScript
		.replaceAll(githubExpression("github.event_name"), eventName)
		.replaceAll(githubExpression("github.event.before"), before)
		.replaceAll(githubExpression("github.event.pull_request.base.sha"), before)
		.replaceAll(githubExpression("github.event.repository.default_branch"), defaultBranch);

	try {
		const result = spawnSync("bash", ["-e", "-c", script], {
			cwd: repoRoot,
			encoding: "utf8",
			env: { ...process.env, GITHUB_OUTPUT: outputPath },
		});

		if (result.status !== 0) {
			throw new Error(result.stderr);
		}

		return fs.readFileSync(outputPath, "utf8").trim().replace("sha=", "");
	} finally {
		fs.rmSync(outputDirectory, { force: true, recursive: true });
	}
};

const defaultBranchMergeBase = spawnSync("git", ["merge-base", "HEAD", "origin/develop"], {
	cwd: repoRoot,
	encoding: "utf8",
}).stdout.trim();

describe("lint-and-format workflow", () => {
	it("uses read-only repository permissions", () => {
		expect(workflow).toMatch(/^permissions:\n\s+contents: read$/m);
		expect(workflow).toMatch(/persist-credentials: false/);
	});

	it("uses the default-branch merge base when an event has no comparison commit", () => {
		expect(workflow).toContain("github.event.repository.default_branch");
		expect(workflow).toContain("git merge-base HEAD");
	});

	it("fetches the default branch explicitly instead of a same-named tag", () => {
		expect(workflow).toContain(
			'git fetch --no-tags origin "refs/heads/$default_branch:refs/remotes/origin/$default_branch"',
		);
	});

	it("uses the default-branch merge base for a new branch push", () => {
		expect(resolveComparisonBase("push", "0".repeat(40))).toBe(defaultBranchMergeBase);
	});

	it("uses the default-branch merge base when a push comparison commit is unavailable", () => {
		expect(resolveComparisonBase("push", "a".repeat(40))).toBe(defaultBranchMergeBase);
	});

	it("does not mutate checked-out files or push commits", () => {
		expect(workflow).not.toMatch(/--write\b/);
		expect(workflow).not.toMatch(/git (add|commit|push)\b/);
		expect(workflow).not.toContain("locale-sort.sh");
	});

	it("runs backend and frontend tests from frozen Yarn Classic installs", () => {
		expect(workflow).toContain("yarn@1.22.22");
		expect(workflow).toContain("install --frozen-lockfile");
		expect(workflow).toMatch(/backend[\s\S]*test --run/);
		expect(workflow).toMatch(/frontend[\s\S]*test --run/);
	});

	it("reports high and critical dependency findings without blocking existing baseline debt", () => {
		expect(workflow).toMatch(/audit --level high/);
		expect(workflow).toMatch(
			/Audit backend dependencies \(advisory: high and critical\)"\n\s+continue-on-error: true/,
		);
		expect(workflow).toMatch(
			/Audit frontend dependencies \(advisory: high and critical\)"\n\s+continue-on-error: true/,
		);
		expect(workflow).toContain("git diff --check");
	});

	it("runs Biome within each package configuration root", () => {
		expect(workflow).toContain('cd "$GITHUB_WORKSPACE/backend"');
		expect(workflow).toContain('cd "$GITHUB_WORKSPACE/frontend"');
		expect(workflow).not.toContain("./backend/node_modules/.bin/biome check");
	});

	it("does not send ignored package manifests to Biome", () => {
		expect(workflow).toContain("\\.(cjs|js|ts|tsx)$");
		expect(workflow).not.toContain("\\.(cjs|js|ts|tsx|json)$");
	});

	it("delegates added-line token scanning to its tested script", () => {
		expect(workflow).toContain("node backend/scripts/ci/scan-added-diff-secrets.js");
		expect(workflow).not.toContain("node --input-type=module <<'NODE'");
	});
});
