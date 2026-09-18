import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const workflow = fs.readFileSync(backendSourcePath("..", ".github", "workflows", "docker.yml"), "utf8");
const releaseVersionExpression = "$" + "{{ needs.prepare.outputs.version }}";

describe("Docker publication workflow", () => {
	it("publishes immutable numbered release assets only from version tags", () => {
		expect(workflow).toMatch(
			/release:[\s\S]*?if: \$\{\{ github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/v'\) && github\.repository_owner == 'shedowe19' \}\}/,
		);
		expect(workflow).toContain(`gh release view "v${releaseVersionExpression}"`);
	});

	it("smoke-tests the exact image before packaging deployment artifacts", () => {
		expect(workflow).toContain('docker image inspect "$SMOKE_IMAGE" >/dev/null 2>&1 || docker pull "$SMOKE_IMAGE"');
		expect(workflow).toMatch(/Smoke loaded image as root and UID 1000[\s\S]*?bash scripts\/ci\/docker-smoke\.sh/);
	});
});
