import fs from "node:fs";
import * as yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const readSource = (path) => fs.readFileSync(backendSourcePath(path), "utf8");

const yamlConsumers = ["internal/anubis.js", "internal/gitops.js"];
const packageManifest = JSON.parse(readSource("package.json"));

describe("js-yaml ESM compatibility", () => {
	it("uses the named exports exposed by js-yaml under Node 26", () => {
		expect(yaml).not.toHaveProperty("default");
		expect(yaml.dump).toBeTypeOf("function");
		expect(yaml.load).toBeTypeOf("function");
	});

	it("does not request an unavailable default export in backend YAML consumers", () => {
		for (const sourcePath of yamlConsumers) {
			const source = readSource(sourcePath);

			expect(source, sourcePath).toContain('import * as yaml from "js-yaml";');
			expect(source, sourcePath).not.toContain('import yaml from "js-yaml";');
		}
	});

	it("keeps the scoped security resolution for transitive js-yaml 4", () => {
		// Resolved versions are checked separately without relying on Yarn's selector grouping.
		expect(packageManifest.resolutions["@apidevtools/swagger-parser/**/js-yaml"]).toBe("4.3.2");
	});
});
