import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import $RefParser from "@apidevtools/json-schema-ref-parser";
import PACKAGE from "../package.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let compiledSchema = null;
let compilation = null;

/**
 * Compiles the schema, by dereferencing it, only once
 * and returns the memory cached value
 */
const getCompiledSchema = async () => {
	if (compiledSchema !== null) {
		return compiledSchema;
	}
	if (compilation === null) {
		compilation = $RefParser
			.dereference(`${__dirname}/swagger.json`, {
				mutateInputSchema: false,
			})
			.then((schema) => {
				schema.info.version = PACKAGE.version;
				compiledSchema = schema;
				return schema;
			})
			.finally(() => {
				compilation = null;
			});
	}
	return compilation;
};

/**
 * Scans the schema for the validation schema for the given path and method
 * and returns it.
 *
 * @param {string} path
 * @param {string} method
 * @returns string|null
 */
const getValidationSchema = (path, method) => {
	if (
		compiledSchema !== null &&
		typeof compiledSchema.paths[path] !== "undefined" &&
		typeof compiledSchema.paths[path][method] !== "undefined" &&
		typeof compiledSchema.paths[path][method].requestBody !== "undefined" &&
		typeof compiledSchema.paths[path][method].requestBody.content !== "undefined" &&
		typeof compiledSchema.paths[path][method].requestBody.content["application/json"] !== "undefined" &&
		typeof compiledSchema.paths[path][method].requestBody.content["application/json"].schema !== "undefined"
	) {
		return compiledSchema.paths[path][method].requestBody.content["application/json"].schema;
	}
	return null;
};

export { getCompiledSchema, getValidationSchema };
