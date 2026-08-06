import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const readFile = (path) => fs.readFileSync(join(repoRoot, path), "utf8");
const readManifest = (directory) => JSON.parse(readFile(`${directory}/package.json`));

const debianImageVariable = "$" + "{DEBIAN_IMAGE}";
const shieldpmNginxImageVariable = "$" + "{SHIELDPM_NGINX_IMAGE}";
const node26VersionAssertion = "node --version | grep -E '^v26\\.'";
const dockerfile = readFile("Dockerfile");
const qualityWorkflow = readFile(".github/workflows/lint-and-format.yml");
const dependencyWorkflow = readFile(".github/workflows/npm-updates.yml");
const nodeSetupScriptPath = join(repoRoot, "scripts", "setup-node-apt.sh");

describe("Node 26 runtime contract", () => {
	it("uses the embedded NodeSource APT setup in every application container stage", () => {
		expect(fs.existsSync(nodeSetupScriptPath)).toBe(true);
		expect(dockerfile).toContain(`FROM --platform="$BUILDPLATFORM" ${debianImageVariable} AS frontend`);
		expect(dockerfile).toContain(`FROM ${debianImageVariable} AS backend`);
		expect(dockerfile).toContain(`FROM ${shieldpmNginxImageVariable}`);
		expect(
			dockerfile.match(/COPY scripts\/setup-node-apt\.sh \/usr\/local\/bin\/setup-node-apt\.sh/g),
		).toHaveLength(3);
		expect(dockerfile.match(/bash \/usr\/local\/bin\/setup-node-apt\.sh/g)).toHaveLength(3);
		expect(dockerfile.match(/apt-get install -y --no-install-recommends nodejs/g)).toHaveLength(3);
		expect(dockerfile.split(node26VersionAssertion)).toHaveLength(4);
		expect(dockerfile).not.toContain("ARG NODE_IMAGE=");
	});

	it("configures the NodeSource Node 26 APT repository from the committed setup script", () => {
		const setupScript = readFile("scripts/setup-node-apt.sh");

		expect(setupScript).toContain('NODE_VERSION="26.x"');
		expect(setupScript).toContain("https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key");
		expect(setupScript).toContain("/etc/apt/sources.list.d/nodesource.sources");
		expect(setupScript).toContain("URIs: https://deb.nodesource.com/node_$node_version");
	});

	it("installs Yarn Classic through Corepack when available and npm otherwise", () => {
		expect(dockerfile).toContain("command -v corepack");
		expect(dockerfile).toContain("npm install --global yarn@1.22.22");
		expect(dockerfile.match(/yarn install --frozen-lockfile --production=false/g)).toHaveLength(2);
	});

	it("uses the application root as the frontend and backend working directory", () => {
		expect(dockerfile).not.toContain("WORKDIR /app/frontend");
		expect(dockerfile.match(/^WORKDIR \/app$/gm)).toHaveLength(3);
	});

	it("installs native-build prerequisites before fetching backend runtime binaries", () => {
		expect(dockerfile).toContain(
			"apt-get install -y --no-install-recommends ca-certificates binutils file curl make g++ python3",
		);
	});

	it("pins the internal Nginx image and verifies downloaded runtime binaries", () => {
		expect(dockerfile).toMatch(
			/ARG SHIELDPM_NGINX_IMAGE=ghcr\.io\/shedowe19\/shieldpm-nginx:master@sha256:[0-9a-f]{64}/,
		);
		expect(dockerfile).toContain("ARG ANUBIS_VERSION=1.26.2");
		expect(dockerfile).toContain("ARG OAUTH2_PROXY_VERSION=7.15.3");
		expect(dockerfile).toContain("ARG CLOUDFLARED_VERSION=2026.7.3");
		expect(dockerfile.match(/sha256sum --check --status/g)).toHaveLength(3);
		expect(dockerfile).toMatch(/COPY --from=backend-runtime\s+\/app\/cloudflared \/usr\/local\/bin\/cloudflared/);
	});

	it("checks the pinned NodeSource signing-key fingerprint before trusting its APT repository", () => {
		const setupScript = readFile("scripts/setup-node-apt.sh");

		expect(setupScript).toContain('nodesource_key_fingerprint="6F71F525282841EEDAF851B42F59B5F99B1BE0B4"');
		expect(setupScript).toContain("gpg --show-keys --with-colons");
	});

	it("uses Node 26 for every application GitHub Actions runtime", () => {
		expect(qualityWorkflow).toMatch(/node-version:\s*26(?:\s|$)/);
		expect(dependencyWorkflow).toMatch(/node-version:\s*26(?:\s|$)/);
	});

	it("declares Node 26 as the minimum supported application runtime", () => {
		expect(readManifest("backend").engines?.node).toBe(">=26");
		expect(readManifest("frontend").engines?.node).toBe(">=26");
	});
});
