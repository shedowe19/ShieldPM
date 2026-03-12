import Ajv from "ajv/dist/2020.js";
import errs from "../error.js";

const ajv = new /** @type {any} */ (Ajv)({
	verbose: true,
	allErrors: true,
	allowUnionTypes: true,
	strict: false,
	coerceTypes: true,
});

/**
 * @param {Object} schema
 * @param {Object} payload
 * @returns {Promise}
 */
const apiValidator = async (schema, payload /*, description*/) => {
	if (!schema) {
		throw new errs.ValidationError("Schema is undefined");
	}

	// Can't use falsy check here as valid payload could be `0` or `false`
	if (typeof payload === "undefined") {
		throw new errs.ValidationError("Payload is undefined");
	}

	// 🛡️ Nginx Config Injection Sanitizer
	if (payload && typeof payload.advanced_config === "string") {
		const toxics = ["lua", "alias", "root", "exec", "system", "os.execute"];
		const lowerConfig = payload.advanced_config.toLowerCase();
		for (const keyword of toxics) {
			if (lowerConfig.includes(keyword)) {
				throw new errs.ValidationError(`Security restriction: Toxic keyword '${keyword}' is not allowed in advanced_config.`);
			}
		}
	}

	const validate = ajv.compile(schema);

	const valid = validate(payload);

	if (valid && !validate.errors) {
		return payload;
	}

	const message = ajv.errorsText(validate.errors);
	const err = new errs.ValidationError(message);
	/** @type {any} */ (err).debug = { validationErrors: validate.errors, payload };
	throw err;
};

export default apiValidator;
