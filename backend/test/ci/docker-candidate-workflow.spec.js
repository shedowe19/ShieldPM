import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { load } from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const workflow = load(fs.readFileSync(backendSourcePath("..", ".github/workflows/docker.yml"), "utf8"));
const steps = workflow.jobs.build.steps;
const push = steps.find((step) => step.run?.includes('docker push "$SMOKE_IMAGE"'));
const promote = workflow.jobs.merge.steps.find((step) => step.run?.includes("IMAGES=()"));
const image = "ghcr.io/shedowe19/shieldpm";
const candidate = `${image}:candidate-123-2-x86_64`;
const refs = [`${image}@sha256:${"a".repeat(64)}`, `${image}@sha256:${"b".repeat(64)}`];
const directories = [];

afterEach(() => {
	for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const execute = (script, { files = {}, digest = refs[0], failPush = false } = {}) => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-candidate-"));
	directories.push(directory);
	const log = path.join(directory, "calls.jsonl");
	const executable = path.join(directory, "docker.mjs");
	fs.writeFileSync(
		executable,
		`import fs from "node:fs";
const args = process.argv.slice(2);
fs.appendFileSync(process.env.DOCKER_LOG, JSON.stringify(args) + "\\n");
if (args[0] === "push" && process.env.FAIL_PUSH === "true") process.exit(1);
if (args[0] === "image" && args[1] === "inspect") console.log(process.env.IMAGE_DIGEST);
`,
	);
	fs.writeFileSync(path.join(directory, "docker"), `#!/bin/sh\nexec "${process.execPath}" "${executable}" "$@"\n`, {
		mode: 0o700,
	});
	for (const [filename, value] of Object.entries(files)) {
		const destination = path.join(directory, filename);
		fs.mkdirSync(path.dirname(destination), { recursive: true });
		fs.writeFileSync(destination, value);
	}
	const result = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], {
		cwd: directory,
		encoding: "utf8",
		env: {
			...process.env,
			PATH: `${directory}:${process.env.PATH}`,
			DOCKER_LOG: log,
			IMAGE_NAME: image,
			SMOKE_IMAGE: candidate,
			IMAGE_ARCH: "x86_64",
			TAG_BASE: `${image}:develop`,
			IMAGE_DIGEST: digest,
			FAIL_PUSH: String(failPush),
		},
	});
	const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").map(JSON.parse) : [];
	return { result, calls, directory };
};

describe("Standard Docker candidate promotion", () => {
	it("never builds or smoke-tests a public deployment tag", () => {
		const build = steps.find((step) => step.with?.load === true);
		expect(build.with.push).toBe(false);
		expect(build.with.tags).toContain("needs.prepare.outputs.candidate_tag");
		expect(workflow.jobs.prepare.steps.find((step) => step.id === "calc").run).toContain(
			"candidate-$" + "{GITHUB_RUN_ID}-$" + "{GITHUB_RUN_ATTEMPT}",
		);
		for (const script of ["geoip-update-smoke.sh", "docker-smoke.sh"]) {
			const smoke = steps.find((step) => step.run?.includes(`bash scripts/ci/${script}`));
			expect(smoke.env.SMOKE_IMAGE).toBe(build.with.tags);
			expect(smoke.if).toBeUndefined();
			expect(smoke["continue-on-error"]).toBeUndefined();
			expect(steps.indexOf(smoke)).toBeGreaterThan(steps.indexOf(build));
			expect(steps.indexOf(smoke)).toBeLessThan(steps.indexOf(push));
		}
		expect(steps.filter((step) => step.with?.push && step.with.push !== false)).toEqual([]);
		expect(workflow.jobs.merge.needs).toEqual(["prepare", "build"]);
	});

	it("never publishes, promotes or releases pull request images", () => {
		for (const step of steps.filter((step) => step === push || step.with?.name?.startsWith("image-digest-"))) {
			expect(step.if).toBe("github.event_name != 'pull_request'");
		}
		expect(workflow.jobs.merge.if).toContain("github.event_name != 'pull_request'");
		expect(workflow.jobs.release.if).toContain("github.event_name == 'push'");
		expect(workflow.jobs.release.if).toContain("refs/heads/develop");
		expect(workflow.jobs.merge.steps.some((step) => step.uses?.includes("add-pr-comment"))).toBe(false);
		expect(workflow.permissions).toEqual({ contents: "read" });
		expect(workflow.jobs.build.permissions).toEqual({ contents: "read", packages: "write" });
		expect(workflow.jobs.merge.permissions).toEqual({ packages: "write" });
		expect(workflow.jobs.release.permissions).toEqual({ contents: "write" });
		expect(workflow.concurrency["cancel-in-progress"]).toBe("$" + "{{ github.event_name == 'pull_request' }}");
		expect(workflow.jobs.release.concurrency["cancel-in-progress"]).toBe(false);
	});

	it("records exactly the local tested image's immutable registry reference", () => {
		const { result, calls, directory } = execute(push.run);
		expect(result.status, result.stderr).toBe(0);
		expect(calls).toEqual([
			["push", candidate],
			["image", "inspect", "--format", "{{index .RepoDigests 0}}", candidate],
		]);
		expect(fs.readFileSync(path.join(directory, "image-digests/x86_64.txt"), "utf8")).toBe(`${refs[0]}\n`);
	});

	it.each([
		["push failure", { failPush: true }],
		["foreign pushed reference", { digest: `other/image@sha256:${"a".repeat(64)}` }],
		["invalid pushed digest", { digest: `${image}@sha256:invalid` }],
	])("does not produce promotion input after %s", (_name, options) => {
		const { result, directory } = execute(push.run, options);
		expect(result.status).not.toBe(0);
		expect(fs.existsSync(path.join(directory, "image-digests/x86_64.txt"))).toBe(false);
	});

	it("promotes the multiarch and architecture tags from only the two tested immutable references", () => {
		const { result, calls } = execute(promote.run, {
			files: { "image-digests/x86_64.txt": refs[0], "image-digests/aarch64.txt": refs[1] },
		});
		expect(result.status, result.stderr).toBe(0);
		expect(calls).toEqual([
			["buildx", "imagetools", "create", "--tag", `${image}:develop`, ...refs],
			["buildx", "imagetools", "create", "--prefer-index=false", "--tag", `${image}:develop-x86_64`, refs[0]],
			["buildx", "imagetools", "create", "--prefer-index=false", "--tag", `${image}:develop-aarch64`, refs[1]],
		]);
	});

	it.each([
		["missing second architecture", { "image-digests/x86_64.txt": refs[0] }],
		["invalid second digest", { "image-digests/x86_64.txt": refs[0], "image-digests/aarch64.txt": "invalid" }],
		[
			"foreign repository",
			{
				"image-digests/x86_64.txt": refs[0],
				"image-digests/aarch64.txt": `other/image@sha256:${"b".repeat(64)}`,
			},
		],
	])("changes no public tag for %s", (_name, files) => {
		const { result, calls } = execute(promote.run, { files });
		expect(result.status).not.toBe(0);
		expect(calls).toEqual([]);
	});
});
