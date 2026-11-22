/**
 * Tool argument validation.
 *
 * The JSON schema advertised to the model becomes the execution contract:
 * every tool call is validated with Ajv before the executor touches a service.
 * Unknown top-level fields are rejected (additionalProperties: false), so a
 * model cannot smuggle extra options past the advertised schema.
 */

import Ajv from "ajv/dist/2020.js";
import errs from "../../lib/error.js";
import { needsConfirmation } from "./confirmation.js";

const ajv = new /** @type {any} */ (Ajv)({
	verbose: true,
	allErrors: true,
	allowUnionTypes: true,
	strict: false,
	coerceTypes: true,
});

/** @type {Map<string, Function>} */
const validators = new Map();

const clone = (value) => {
	try {
		return JSON.parse(JSON.stringify(value));
	} catch (_err) {
		return value;
	}
};

/**
 * Apply documented backwards compatible aliases before validation.
 * These are the only tolerated deviations from the advertised schema.
 * @param {string} toolName
 * @param {Object} args
 */
const normalizeArguments = (toolName, args) => {
	if (!args || typeof args !== "object" || Array.isArray(args)) return args;
	const copy = clone(args);
	if (toolName === "create_user") {
		if (!copy.auth && typeof copy.password === "string") {
			copy.auth = { type: "password", secret: copy.password };
		}
		if (!copy.nickname && typeof copy.name === "string") {
			copy.nickname = copy.name;
		}
	}
	if (toolName === "update_user_password" && !copy.auth && typeof copy.password === "string") {
		copy.auth = { type: "password", secret: copy.password };
	}
	return copy;
};

const validatorFor = (toolName, parameters) => {
	if (validators.has(toolName)) return validators.get(toolName);
	const schema = {
		...(parameters || { type: "object", properties: {} }),
		additionalProperties: false,
	};
	const validator = ajv.compile(schema);
	validators.set(toolName, validator);
	return validator;
};

/**
 * Validate a tool call's arguments against the advertised JSON schema.
 *
 * @param {{name: string, parameters?: Object}} toolDefinition
 * @param {unknown} rawArgs
 * @returns {Object} A validated copy of the arguments
 * @throws {errs.ValidationError} when the arguments do not match the schema
 */
export const validateToolArguments = (toolDefinition, rawArgs) => {
	const toolName = toolDefinition?.name;
	if (rawArgs !== undefined && rawArgs !== null && (typeof rawArgs !== "object" || Array.isArray(rawArgs))) {
		throw new errs.ValidationError(`Invalid arguments for ${toolName}: an object is required`);
	}

	const args = normalizeArguments(toolName, rawArgs || {});
	const validator = validatorFor(toolName, toolDefinition?.parameters);
	if (!validator(args)) {
		const details = ajv.errorsText(validator.errors, { separator: "; " });
		throw new errs.ValidationError(`Invalid arguments for ${toolName}: ${details}`);
	}
	return args;
};

/**
 * Validate and partition model supplied tool calls.
 *
 * @param {Array} toolDefinitions Tool definitions allowed for the current user
 * @param {Array} toolCalls Tool calls emitted by the model
 * @param {{readOnly?: boolean}} [options]
 * @returns {{calls: Array, rejected: Array}} executable calls and error results
 */
export const prepareToolCalls = (toolDefinitions, toolCalls, options = {}) => {
	const byName = new Map((toolDefinitions || []).map((tool) => [tool.function?.name, tool.function]));
	const calls = [];
	const rejected = [];

	for (const call of Array.isArray(toolCalls) ? toolCalls : []) {
		const name = typeof call?.name === "string" ? call.name : "";
		const definition = byName.get(name);
		if (!definition) {
			rejected.push({
				name: name || "unknown",
				toolCallId: call?.id,
				result: `Error: Tool not permitted: ${name || "unknown"}`,
			});
			continue;
		}
		if (options.readOnly) {
			if (needsConfirmation(name)) {
				rejected.push({
					name,
					toolCallId: call?.id,
					result: `Error: This action requires confirmation and is not available in this channel: ${name}`,
				});
				continue;
			}
		}
		try {
			const args = validateToolArguments(definition, call?.args);
			calls.push({ ...call, name, args });
		} catch (err) {
			rejected.push({
				name,
				toolCallId: call?.id,
				result: `Error: ${err?.public ? err.message : `Invalid arguments for ${name}`}`,
			});
		}
	}

	return { calls, rejected };
};
