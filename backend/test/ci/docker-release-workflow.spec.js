import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const workflow = fs.readFileSync(backendSourcePath("..", ".github", "workflows", "docker.yml"), "utf8");
const releaseVersionExpression = "$" + "{{ needs.prepare.outputs.version }}";

describe("Docker publication workflow", () => {
	it("publishes a version once from develop or the matching version tag", () => {
		expect(workflow).toMatch(
			/release:[\s\S]*?if: \$\{\{ github\.event_name == 'push' && \(github\.ref == 'refs\/heads\/develop' \|\| startsWith\(github\.ref, 'refs\/tags\/v'\)\) && github\.repository_owner == 'shedowe19' \}\}/,
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
});
