import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const readFile = (path) => fs.readFileSync(join(repoRoot, path), "utf8");
const readManifest = (directory) => JSON.parse(readFile(`${directory}/package.json`));

const dockerfile = readFile("Dockerfile");
const qualityWorkflow = readFile(".github/workflows/lint-and-format.yml");
const dependencyWorkflow = readFile(".github/workflows/npm-updates.yml");
const nodeImageReference = ["$", "{NODE_IMAGE}"].join("");

describe("Node 22 runtime contract", () => {
	it("uses the official Node 22 image for both application build stages", () => {
		expect(dockerfile).toMatch(/^ARG NODE_IMAGE=node:22-bookworm-slim@sha256:[a-f0-9]{64}$/m);
		expect(dockerfile).toContain(`FROM --platform="$BUILDPLATFORM" ${nodeImageReference} AS frontend`);
		expect(dockerfile).toContain(`FROM ${nodeImageReference} AS backend`);
		expect(dockerfile).not.toMatch(/apt-get[^\n]*\bnodejs\b/);
	});

	it("pins Yarn Classic and installs from the lockfiles in container builds", () => {
		expect(dockerfile).toContain("corepack install --global yarn@1.22.22");
		expect(dockerfile.match(/yarn install --frozen-lockfile --production=false/g)).toHaveLength(2);
	});

	it("installs native-build prerequisites before fetching backend runtime binaries", () => {
		expect(dockerfile).toContain(
			"apt-get install -y --no-install-recommends ca-certificates binutils file curl make g++ python3",
		);
	});

	it("uses Node 22 for every application GitHub Actions runtime", () => {
		expect(qualityWorkflow).toMatch(/node-version:\s*22(?:\s|$)/);
		expect(qualityWorkflow).not.toMatch(/node-version:\s*24/);
		expect(dependencyWorkflow).toMatch(/node-version:\s*22(?:\s|$)/);
	});

	it("declares Node 22 as the minimum supported application runtime", () => {
		expect(readManifest("backend").engines?.node).toBe(">=22");
		expect(readManifest("frontend").engines?.node).toBe(">=22");
	});
});
