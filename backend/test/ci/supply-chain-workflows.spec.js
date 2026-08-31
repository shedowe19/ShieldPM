import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const dockerWorkflow = fs.readFileSync(backendSourcePath("..", ".github", "workflows", "docker.yml"), "utf8");
const promotionWorkflow = fs.readFileSync(backendSourcePath("..", ".github", "workflows", "docker-latest.yml"), "utf8");
const dockerfile = fs.readFileSync(backendSourcePath("..", "Dockerfile"), "utf8");
const nginxChecksumVariable = "$" + "{NGINX_SHA256}";
const imageNameVariable = "$" + "{IMAGE_NAME}";
const digestVariable = "$" + "{DIGEST}";
const matrixArchExpression = "$" + "{{ matrix.arch }}";
const shellArchVariable = "$" + "{arch}";

describe("container supply-chain contract", () => {
	it("pins every action in both publication workflows to an immutable commit", () => {
		for (const workflow of [dockerWorkflow, promotionWorkflow]) {
			const actionReferences = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#\s+(.+))?$/gm)];
			expect(actionReferences.length).toBeGreaterThan(0);
			for (const [, reference, versionComment] of actionReferences) {
				expect(reference).toMatch(/^[^@\s]+@[0-9a-f]{40}$/);
				expect(versionComment).toMatch(/^v\d/);
			}
		}
	});

	it("scans source and the final image before the first registry push", () => {
		const sourceScan = dockerWorkflow.indexOf("gitleaks/gitleaks-action@");
		const imageScan = dockerWorkflow.indexOf("aquasecurity/trivy-action@");
		const scannedArtifact = dockerWorkflow.indexOf("Upload the scanned OCI archive for the publication job");
		const exactCopy = dockerWorkflow.indexOf("skopeo copy --all --preserve-digests");
		expect(sourceScan).toBeGreaterThan(0);
		expect(imageScan).toBeGreaterThan(sourceScan);
		expect(scannedArtifact).toBeGreaterThan(imageScan);
		expect(exactCopy).toBeGreaterThan(scannedArtifact);
		expect(dockerWorkflow).toContain(`outputs: type=oci,dest=/tmp/shieldpm-${matrixArchExpression},tar=false`);
		expect(dockerWorkflow).toContain(`input: /tmp/shieldpm-${matrixArchExpression}`);
		expect(dockerWorkflow.slice(imageScan)).not.toContain("docker/build-push-action@");
		expect(dockerWorkflow).not.toContain("push: true");
		expect(dockerWorkflow).toContain("--preserve-digests");
		expect(dockerWorkflow).toContain('if [ "$remote_digest" != "$local_digest" ]');
		expect(dockerWorkflow).toContain("severity: HIGH,CRITICAL");
	});

	it("grants package publication only to the non-PR merge job", () => {
		const buildJob = dockerWorkflow.slice(dockerWorkflow.indexOf("  build:"), dockerWorkflow.indexOf("  merge:"));
		const mergeJob = dockerWorkflow.slice(dockerWorkflow.indexOf("  merge:"), dockerWorkflow.indexOf("  release:"));

		expect(buildJob).toContain("permissions:\n      contents: read");
		expect(buildJob).not.toContain("packages: write");
		expect(mergeJob).toContain("needs.prepare.outputs.is_pr != 'true'");
		expect(mergeJob).toContain("permissions:\n      contents: read\n      packages: write");
	});

	it("publishes SBOM/provenance and requires a digest-pinned private base", () => {
		expect(dockerfile).toMatch(/^ARG SHIELDPM_NGINX_IMAGE$/m);
		expect(dockerWorkflow).toContain("SHIELDPM_NGINX_IMAGE must contain an approved multi-arch digest");
		expect(dockerWorkflow).toContain("sbom: true");
		expect(dockerWorkflow).toContain("provenance: mode=max");
		expect(dockerWorkflow).toContain("actions/attest-build-provenance@");
		expect(dockerWorkflow).toContain('sha256sum "$TAR_NAME"');
		expect(dockerWorkflow).toContain('sha256sum "$FILE_NAME"');
	});

	it("verifies every downloaded runtime archive before extraction", () => {
		expect(dockerfile.match(/sha256sum --check --strict/g)).toHaveLength(2);
		expect(dockerfile).toContain("092f92b1710ee2eb208f019733f6ce06cbc041884272340bea13635a4515c357");
		expect(dockerfile).toContain("0ae5a43adde4d6c5081ba018e70a76041f496377b12a173da36b419082dd1ab6");
		expect(dockerWorkflow).toContain("879cbba5fb7b5b62db3f3ca5d10028fadbd00b6fd368424206278f639fbf9c94");
		expect(dockerWorkflow).toContain(`echo "${nginxChecksumVariable}  nginx-binaries.tar.gz"`);
	});

	it("never publishes images or release artifacts from pull-request code", () => {
		expect(dockerWorkflow).toContain("if: needs.prepare.outputs.is_pr != 'true'");
		expect(dockerWorkflow).not.toContain("mshick/add-pr-comment");
	});

	it("promotes one reviewed digest without rebuilding or overwriting release tags", () => {
		expect(promotionWorkflow).toContain("^sha256:[0-9a-f]{64}$");
		expect(promotionWorkflow).toContain("Refusing to overwrite");
		expect(promotionWorkflow).toContain(`"${imageNameVariable}@${digestVariable}"`);
		expect(promotionWorkflow).toContain("source_revision");
		expect(promotionWorkflow).toContain("org.opencontainers.image.revision");
		expect(promotionWorkflow).toContain("org.opencontainers.image.source");
		expect(promotionWorkflow).toContain("for arch in amd64 arm64");
		expect(promotionWorkflow).toContain(`docker pull --platform "linux/${shellArchVariable}"`);
		expect(promotionWorkflow).toContain(`source index is missing its Linux ${shellArchVariable} child`);
		expect(promotionWorkflow).toContain("source_digest must identify a Linux amd64/arm64 image index");
		expect(promotionWorkflow).not.toContain("docker/build-push-action");
	});
});
