import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const workflow = fs.readFileSync(backendSourcePath("..", ".github", "workflows", "docker.yml"), "utf8");
const releaseVersionExpression = "$" + "{{ needs.prepare.outputs.version }}";

describe("Docker publication workflow", () => {
	it("publishes a release only from a version tag", () => {
		expect(workflow).toContain(
			"if: ${{ github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v') && github.repository_owner == 'shedowe19' }}",
		);
		expect(workflow).toContain(`RELEASE_TAG: v${releaseVersionExpression}`);
		expect(workflow).toContain('echo "publish=false" >> "$GITHUB_OUTPUT"');
		expect(workflow).toContain('git ls-remote --tags "https://github.com/$GITHUB_REPOSITORY.git"');
		expect(workflow).toContain("if: steps.version_release.outputs.publish == 'true'");
		expect(workflow).toContain("target_commitish: ${{ github.sha }}");
		expect(workflow).toContain("group: shieldpm-release-v${{ needs.prepare.outputs.version }}");
	});

	it("smoke-tests the exact image before packaging deployment artifacts", () => {
		expect(workflow).toContain('docker image inspect "$SMOKE_IMAGE" >/dev/null 2>&1 || docker pull "$SMOKE_IMAGE"');
		expect(workflow).toMatch(/Smoke loaded image as root and UID 1000[\s\S]*?bash scripts\/ci\/docker-smoke\.sh/);
	});

	it("attests and signs the published multiarch image", () => {
		expect(workflow).toMatch(/merge:[\s\S]*?id-token: write[\s\S]*?attestations: write/);
		expect(workflow).toContain("anchore/sbom-action@");
		expect(workflow).toContain("actions/attest-build-provenance@");
		expect(workflow).toContain("sbom-path: shieldpm.spdx.json");
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal workflow expression
		expect(workflow).toContain('cosign sign --yes "${IMAGE_NAME}@${IMAGE_DIGEST}"');
		expect(workflow).toContain("Unable to resolve the published multiarch digest");
	});

	it("signs the release checksums with a keyless Sigstore bundle", () => {
		expect(workflow).toContain("sigstore/cosign-installer@");
		expect(workflow).toContain("cosign sign-blob --yes --bundle SHA256SUMS.sigstore.json SHA256SUMS");
		expect(workflow).toMatch(/release:[\s\S]*?id-token: write/);
	});
});
