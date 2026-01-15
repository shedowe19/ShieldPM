import Ajv from "ajv/dist/2020.js";
import _ from "lodash";
import commonDefinitions from "../../schema/common.json" with { type: "json" };
import errs from "../error.js";

/** @type {any} */ (RegExp.prototype).toJSON = RegExp.prototype.toString;

const ajv = new /** @type {any} */(Ajv)({
	verbose: true,
	allErrors: true,
	allowUnionTypes: true,
	coerceTypes: true,
	strict: false,
	schemas: [commonDefinitions],
});

/**
 *
 * @param   {Object} schema
 * @param   {Object} payload
 * @returns {Promise<Object>}
 */
const validator = async (schema, payload) => {
	if (!payload) {
		throw new errs.InternalValidationError("Payload is falsy");
	}

	const validate = ajv.compile(schema);
	const valid = validate(payload);

	if (valid && !validate.errors) {
		return _.cloneDeep(payload);
	}

	const message = ajv.errorsText(validate.errors);
	throw new errs.InternalValidationError(message);
};

export default validator;
