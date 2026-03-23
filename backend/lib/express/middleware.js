import jwtdecode from "./jwt-decode.js";
import apiValidator from "../validator/api.js";
import { getValidationSchema } from "../../schema/index.js";

export const auth = jwtdecode;

/**
 * Validate request body against a JSON schema.
 *
 * Usage:
 *   validate(schemaId)          — single-arg (legacy)
 *   validate(path, method)      — two-arg (OpenAPI path + HTTP method)
 *
 * Both forms return an async function: (payload) => validatedData.
 */
export const validate = (pathOrSchemaId, method) => {
	const schema = method
		? getValidationSchema(pathOrSchemaId, method)
		: getValidationSchema(pathOrSchemaId);
	return (payload) => apiValidator(schema, payload);
};

export { jwtdecode, apiValidator, getValidationSchema };
