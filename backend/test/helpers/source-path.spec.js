import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "./source-path.js";

describe("backendSourcePath", () => {
	it("resolves backend source files from the current worktree", () => {
		const sourcePath = backendSourcePath("internal", "chat.js");

		expect(fs.existsSync(sourcePath)).toBe(true);
	});
});
