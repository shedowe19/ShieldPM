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
const debianImageVariable = "$" + "{DEBIAN_IMAGE}";
const shieldpmNginxImageVariable = "$" + "{SHIELDPM_NGINX_IMAGE}";

describe("Node 24 LTS runtime contract", () => {
	it("uses the committed NodeSource setup in every application container stage", () => {
		expect(fs.existsSync(join(repoRoot, "scripts", "setup-node-apt.sh"))).toBe(true);
		expect(dockerfile).toContain(`FROM --platform="$BUILDPLATFORM" ${debianImageVariable} AS frontend`);
		expect(dockerfile).toContain(`FROM ${debianImageVariable} AS backend`);
		expect(dockerfile).toContain(`FROM ${shieldpmNginxImageVariable}`);
		expect(
			dockerfile.match(/COPY scripts\/setup-node-apt\.sh \/usr\/local\/bin\/setup-node-apt\.sh/g),
		).toHaveLength(3);
		expect(dockerfile.match(/node --version \| grep -E '\^v24\\\.'/g)).toHaveLength(3);
		expect(dockerfile).not.toContain("ARG NODE_IMAGE=");
	});

	it("configures the NodeSource Node 24 repository from reviewed local code", () => {
		const setupScript = readFile("scripts/setup-node-apt.sh");
		expect(setupScript).toContain('NODE_VERSION="24.x"');
		expect(setupScript).toContain("https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key");
		expect(setupScript).toContain("Signed-By: /usr/share/keyrings/nodesource.gpg");
	});

	it("pins Corepack and Yarn Berry and uses immutable installs only", () => {
		expect(dockerfile).toContain("corepack@0.36.0");
		expect(dockerfile).toContain("yarn@4.18.0");
		expect(dockerfile.match(/yarn install --immutable/g)).toHaveLength(2);
		expect(dockerfile).not.toContain("yarn@1.22.22");
		expect(dockerfile).not.toContain("--frozen-lockfile");
	});

	it("disables dependency scripts except for the reviewed SQLite native build", () => {
		expect(readFile("backend/.yarnrc.yml")).toMatch(/^enableScripts:\s*false$/m);
		expect(readManifest("backend").dependenciesMeta?.["better-sqlite3"]?.built).toBe(true);
	});

	it("tests the Node 24 baseline in application workflows", () => {
		expect(qualityWorkflow).toMatch(/node-version:\s*(?:\[)?[^\n]*24/);
		expect(dependencyWorkflow).toMatch(/node-version:\s*24(?:\.\d+\.\d+)?(?:\s|$)/);
	});

	it("declares the exact package manager and Node 24 minimum", () => {
		for (const directory of ["backend", "frontend"]) {
			const manifest = readManifest(directory);
			expect(manifest.engines?.node).toBe(">=24");
			expect(manifest.packageManager).toBe("yarn@4.18.0");
		}
	});
});
