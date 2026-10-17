import Ajv from "ajv/dist/2020.js";
import _ from "lodash";
import commonDefinitions from "../../schema/common.json" with { type: "json" };
import errs from "../error.js";

/** @type {any} */ (RegExp.prototype).toJSON = RegExp.prototype.toString;

const ajv = new /** @type {any} */ (Ajv)({
	verbose: true,
	allErrors: true,
	allowUnionTypes: true,
	coerceTypes: true,
	strict: false,
	schemas: [commonDefinitions],
});

const MAX_VALIDATORS = 128;
const validators = new Map();

// Routes may construct equivalent schema literals for each request. AJV caches
// by object identity, so compiling those objects directly retains them forever.
const schemaKey = (schema) =>
	JSON.stringify(schema, (_key, value) =>
		value && typeof value === "object" && !Array.isArray(value)
			? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
			: value,
	);

const compiledValidator = (schema) => {
	const key = schemaKey(schema);
	const cached = validators.get(key);
	if (cached) {
		validators.delete(key);
		validators.set(key, cached);
		return cached.validate;
	}
	// A canonical copy also avoids reusing stale AJV code if a caller mutates
	// an existing schema object before its next invocation.
	const stableSchema = JSON.parse(key);
	const validate = ajv.compile(stableSchema);
	validators.set(key, { schema: stableSchema, validate });
	if (validators.size > MAX_VALIDATORS) {
		const oldestKey = validators.keys().next().value;
		const oldest = validators.get(oldestKey);
		validators.delete(oldestKey);
		ajv.removeSchema(oldest.schema);
	}
	return validate;
};

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

	const validate = compiledValidator(schema);
	const valid = validate(payload);

	if (valid && !validate.errors) {
		return _.cloneDeep(payload);
	}

	const message = ajv.errorsText(validate.errors);
	throw new errs.InternalValidationError(message);
};

export default validator;
