import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const packageManifest = (directory) =>
	JSON.parse(fs.readFileSync(backendSourcePath("..", directory, "package.json"), "utf8"));

describe("contributor toolchain contract", () => {
	it("declares Yarn Classic consistently for backend and frontend", () => {
		for (const manifest of [packageManifest("backend"), packageManifest("frontend")]) {
			expect(manifest.packageManager).toBe("yarn@1.22.22");
		}
	});

	it("offers an executable backend development command", () => {
		expect(packageManifest("backend").scripts.dev).toBe("node index-dev.js");
	});
});
