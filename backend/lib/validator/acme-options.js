import Ajv from "ajv/dist/2020.js";
import errs from "../error.js";

const ajv = new /** @type {any} */ (Ajv)({
	coerceTypes: false,
	verbose: false,
	strict: false,
	allowUnionTypes: true,
});

/** Validate write-only credentials without coercion or payload-bearing error details.
 * @param {object} schema
 * @param {unknown} payload
 * @returns {Promise<any>}
 */
const validateAcmeOptions = async (schema, payload) => {
	if (!schema || !ajv.compile(schema)(payload)) {
		throw new errs.ValidationError("Invalid ACME options. Check the account fields and option types.");
	}
	return payload;
};

export default validateAcmeOptions;
