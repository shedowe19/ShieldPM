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

const runGit = (cwd, args) => {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(result.stderr);
	}
	return result.stdout.trim();
};

const commitFixture = (repository, message) =>
	runGit(repository, [
		"-c",
		"user.name=ShieldPM CI",
		"-c",
		"user.email=ci@shieldpm.invalid",
		"-c",
		"commit.gpgSign=false",
		"commit",
		"--quiet",
		"--allow-empty",
		"--no-verify",
		"-m",
		message,
	]);

const createComparisonRepository = () => {
	const repository = fs.mkdtempSync(join(tmpdir(), "shieldpm-workflow-git-"));
	runGit(repository, ["init", "--quiet"]);
	commitFixture(repository, "base");
	const expectedBase = runGit(repository, ["rev-parse", "HEAD"]);
	runGit(repository, ["checkout", "--quiet", "-B", "feature"]);
	commitFixture(repository, "feature");
	runGit(repository, ["update-ref", "refs/remotes/origin/develop", expectedBase]);
	return { expectedBase, repository };
};

const resolveComparisonBase = (eventName, before, defaultBranch = "develop") => {
	const outputDirectory = fs.mkdtempSync(join(tmpdir(), "shieldpm-workflow-"));
	const outputPath = join(outputDirectory, "github-output");
	const { expectedBase, repository } = createComparisonRepository();
	const script = comparisonBaseScript
		.replaceAll(githubExpression("github.event_name"), eventName)
		.replaceAll(githubExpression("github.event.before"), before)
		.replaceAll(githubExpression("github.event.pull_request.base.sha"), before)
		.replaceAll(githubExpression("github.event.repository.default_branch"), defaultBranch);

	try {
		const result = spawnSync("bash", ["-e", "-c", script], {
			cwd: repository,
			encoding: "utf8",
			env: { ...process.env, GITHUB_OUTPUT: outputPath },
		});

		if (result.status !== 0) {
			throw new Error(result.stderr);
		}

		return {
			expectedBase,
			resolvedBase: fs.readFileSync(outputPath, "utf8").trim().replace("sha=", ""),
		};
	} finally {
		fs.rmSync(outputDirectory, { force: true, recursive: true });
		fs.rmSync(repository, { force: true, recursive: true });
	}
};

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
		const { expectedBase, resolvedBase } = resolveComparisonBase("push", "0".repeat(40));
		expect(resolvedBase).toBe(expectedBase);
	});

	it("uses the default-branch merge base when a push comparison commit is unavailable", () => {
		const { expectedBase, resolvedBase } = resolveComparisonBase("push", "a".repeat(40));
		expect(resolvedBase).toBe(expectedBase);
	});

	it("does not mutate checked-out files or push commits", () => {
		expect(workflow).not.toMatch(/--write\b/);
		expect(workflow).not.toMatch(/git (add|commit|push)\b/);
		expect(workflow).not.toContain("locale-sort.sh");
	});

	it("runs the complete backend and frontend gates from immutable Yarn 4 installs", () => {
		expect(workflow).toContain("YARN_VERSION: 4.18.0");
		expect(workflow).toContain("install --immutable");
		expect(workflow).not.toContain("yarn@1.22.22");
		expect(workflow).toMatch(/backend[\s\S]*check/);
		expect(workflow).toMatch(/frontend[\s\S]*check/);
		expect(workflow).toMatch(/backend[\s\S]*tsc --noEmit/);
		expect(workflow).toMatch(/frontend[\s\S]*tsc --noEmit/);
		expect(workflow).toMatch(/backend[\s\S]*test --run/);
		expect(workflow).toMatch(/frontend[\s\S]*test --run/);
		expect(workflow).toContain("test:e2e:ci");
	});

	it("blocks high and critical dependency findings", () => {
		expect(workflow).toMatch(/npm audit --recursive --severity high/g);
		expect(workflow).not.toContain("continue-on-error: true");
		expect(workflow).toContain("git diff --check");
	});

	it("runs Biome through each package configuration", () => {
		expect(workflow).toContain("yarn --cwd backend check");
		expect(workflow).toContain("yarn --cwd frontend check");
		expect(workflow).not.toContain("./backend/node_modules/.bin/biome check");
	});

	it("delegates added-line token scanning to its tested script", () => {
		expect(workflow).toContain("node backend/scripts/ci/scan-added-diff-secrets.js");
		expect(workflow).not.toContain("node --input-type=module <<'NODE'");
	});

	it("pins third-party actions to full commit SHAs", () => {
		for (const line of workflow.split("\n").filter((candidate) => candidate.trim().startsWith("uses:"))) {
			expect(line).toMatch(/@[0-9a-f]{40}(?:\s+#.*)?$/);
		}
	});

	it("verifies resumable migrations on MySQL and PostgreSQL", () => {
		expect(workflow).toContain("mysql:8.4");
		expect(workflow).toContain("postgres:17");
		expect(workflow).toContain("Verify MySQL migration resume");
		expect(workflow).toContain("Verify PostgreSQL migration resume");
		expect(workflow).toContain("ci:migrate");
	});
});
