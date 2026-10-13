import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import * as yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const readSource = (path) => fs.readFileSync(backendSourcePath(path), "utf8");

const yamlConsumers = ["internal/anubis.js", "internal/gitops.js"];

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

	it("dereferences local schema references from a YAML OpenAPI document", async () => {
		const directory = fs.mkdtempSync(join(tmpdir(), "shieldpm-openapi-yaml-"));
		const documentPath = join(directory, "openapi.yaml");

		try {
			fs.writeFileSync(
				documentPath,
				[
					"openapi: 3.0.3",
					"info:",
					"  title: YAML compatibility fixture",
					"  version: 1.0.0",
					"paths:",
					"  /health:",
					"    get:",
					"      responses:",
					"        '200':",
					"          description: Health status",
					"          content:",
					"            application/json:",
					"              schema:",
					"                $ref: '#/components/schemas/Health'",
					"components:",
					"  schemas:",
					"    Health:",
					"      type: object",
					"      properties:",
					"        healthy:",
					"          type: boolean",
					"",
				].join("\n"),
			);

			const document = await SwaggerParser.dereference(documentPath);
			const responseSchema = document.paths["/health"].get.responses["200"].content["application/json"].schema;

			expect(responseSchema).toBe(document.components.schemas.Health);
			expect(responseSchema).toEqual({ type: "object", properties: { healthy: { type: "boolean" } } });
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	});
});
