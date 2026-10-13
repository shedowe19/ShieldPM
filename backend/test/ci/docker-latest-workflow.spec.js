import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { load } from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const readWorkflow = (filename) =>
	load(fs.readFileSync(backendSourcePath("..", ".github", "workflows", filename), "utf8"));
const workflow = readWorkflow("docker-latest.yml");
const standardWorkflow = readWorkflow("docker.yml");
const imageName = "ghcr.io/shedowe19/shieldpm";
const candidate = `${imageName}:latest-candidate-123-2-x86_64`;
const refs = [`${imageName}@sha256:${"a".repeat(64)}`, `${imageName}@sha256:${"b".repeat(64)}`];
const steps = workflow.jobs.build.steps;
const pushStep = steps.find((step) => step.run?.includes('docker push "$SMOKE_IMAGE"'));
const mergeScript = workflow.jobs.merge.steps.find((step) => step.run?.includes("IMAGES=()"))?.run;
const temporaryDirectories = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

const runScript = (script, { files = {}, digest = refs[0], failPush = false } = {}) => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-latest-workflow-"));
	temporaryDirectories.push(directory);
	const dockerLog = path.join(directory, "docker.log");
	const mockDocker = path.join(directory, "docker.mjs");
	fs.writeFileSync(
		mockDocker,
		`import fs from "node:fs";
const args = process.argv.slice(2);
fs.appendFileSync(process.env.DOCKER_LOG, JSON.stringify(args) + "\\n");
if (args[0] === "push" && process.env.MOCK_FAIL_PUSH === "true") process.exit(1);
if (args[0] === "image" && args[1] === "inspect") console.log(process.env.MOCK_DIGEST);
`,
	);
	fs.writeFileSync(path.join(directory, "docker"), `#!/bin/sh\nexec "${process.execPath}" "${mockDocker}" "$@"\n`, {
		mode: 0o700,
	});
	for (const [filename, content] of Object.entries(files)) {
		const destination = path.join(directory, filename);
		fs.mkdirSync(path.dirname(destination), { recursive: true });
		fs.writeFileSync(destination, content);
	}
	const result = spawnSync(
		"bash",
		[
			"--noprofile",
			"--norc",
			"-eo",
			"pipefail",
			"-c",
			script.replaceAll("${{ env.IMAGE_NAME }}", imageName).replaceAll("${{ github.run_number }}", "42"),
		],
		{
			cwd: directory,
			encoding: "utf8",
			env: {
				...process.env,
				PATH: `${directory}:${process.env.PATH}`,
				DOCKER_LOG: dockerLog,
				MOCK_DIGEST: digest,
				MOCK_FAIL_PUSH: String(failPush),
				IMAGE_NAME: imageName,
				SMOKE_IMAGE: candidate,
				IMAGE_ARCH: "x86_64",
				RELEASE_TAG: "v4.4.1",
			},
		},
	);
	const calls = fs.existsSync(dockerLog)
		? fs.readFileSync(dockerLog, "utf8").trim().split("\n").map(JSON.parse)
		: [];
	return { result, calls, directory };
};

describe("Latest Docker publication workflow", () => {
	it("tests the loaded candidate on both native architectures before pushing it", () => {
		expect(workflow.jobs.build.strategy.matrix.include).toEqual(standardWorkflow.jobs.build.strategy.matrix.include);
		const finalBuild = steps.find((step) => step.with?.load === true);
		expect(finalBuild?.with.push).toBe(false);
		expect(finalBuild?.with.tags).toBe(
			"${{ env.IMAGE_NAME }}:${{ needs.prepare.outputs.docker_tag_base }}-${{ matrix.arch }}",
		);
		const calculate = workflow.jobs.prepare.steps.find((step) => step.id === "calc");
		expect(calculate.run).toContain("tag_base=latest-candidate-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}");

		for (const script of ["geoip-update-smoke.sh", "docker-smoke.sh"]) {
			const smoke = steps.find((step) => step.run?.includes(`bash scripts/ci/${script}`));
			expect(smoke?.env.SMOKE_IMAGE).toBe(finalBuild.with.tags);
			expect(smoke?.["timeout-minutes"]).toBe(10);
			expect(steps.indexOf(smoke)).toBeGreaterThan(steps.indexOf(finalBuild));
			expect(steps.indexOf(smoke)).toBeLessThan(steps.indexOf(pushStep));
			expect(smoke.if).toBeUndefined();
			expect(smoke["continue-on-error"]).toBeUndefined();
		}
		expect(pushStep.if).toBeUndefined();
		expect(pushStep["continue-on-error"]).toBeUndefined();
		expect(steps.filter((step) => step.with?.push === true)).toEqual([]);
		expect(workflow.jobs.merge.needs).toContain("build");
	});

	it("records the immutable digest of the exact tested local image after pushing it", () => {
		const { result, calls, directory } = runScript(pushStep.run);
		expect(result.status, result.stderr).toBe(0);
		expect(calls).toEqual([
			["push", candidate],
			["image", "inspect", "--format", "{{index .RepoDigests 0}}", candidate],
		]);
		expect(fs.readFileSync(path.join(directory, "image-digests/x86_64.txt"), "utf8")).toBe(`${refs[0]}\n`);
	});

	it("does not produce a publishable digest when the candidate push fails", () => {
		const { result, calls, directory } = runScript(pushStep.run, { failPush: true });
		expect(result.status).not.toBe(0);
		expect(calls).toEqual([["push", candidate]]);
		expect(fs.existsSync(path.join(directory, "image-digests/x86_64.txt"))).toBe(false);
	});

	it("publishes all existing tags from the two tested digests without rebuilding or pulling", () => {
		const { result, calls } = runScript(mergeScript, {
			files: { "image-digests/x86_64.txt": refs[0], "image-digests/aarch64.txt": refs[1] },
		});
		expect(result.status, result.stderr).toBe(0);
		expect(calls).toEqual([
			[
				"buildx", "imagetools", "create", "--tag", `${imageName}:latest`,
				"--tag", `${imageName}:v4.4.1`, "--tag", `${imageName}:42`, ...refs,
			],
			["buildx", "imagetools", "create", "--prefer-index=false", "--tag", `${imageName}:latest-x86_64`, refs[0]],
			["buildx", "imagetools", "create", "--prefer-index=false", "--tag", `${imageName}:latest-aarch64`, refs[1]],
		]);
	});

	it.each([
		["missing architecture", { "image-digests/x86_64.txt": refs[0] }],
		["invalid digest", { "image-digests/x86_64.txt": refs[0], "image-digests/aarch64.txt": "invalid" }],
		[
			"foreign repository",
			{ "image-digests/x86_64.txt": refs[0], "image-digests/aarch64.txt": `other/image@sha256:${"c".repeat(64)}` },
		],
	])("rejects %s before changing any published tag", (_name, files) => {
		const { result, calls } = runScript(mergeScript, { files });
		expect(result.status).not.toBe(0);
		expect(calls).toEqual([]);
	});
});
