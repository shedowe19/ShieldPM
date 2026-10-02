import { beforeAll, describe, expect, it } from "vitest";
import apiValidator from "../../lib/validator/api.js";
import { getCompiledSchema, getValidationSchema } from "../../schema/index.js";

/** @type {{ path: string, validPayloads: object[], invalidPayloads: object[] }[]} */
const contracts = [
	{
		path: "/settings/analytics-options",
		validPayloads: [
			{ detailed_retention_hours: 24, aggregation_retention_days: 35 },
			{ detailed_retention_hours: 1, aggregation_retention_days: 1 },
			{ detailed_retention_hours: 876000, aggregation_retention_days: 36500 },
			{ detailed_retention_hours: 876000, aggregation_retention_days: 1 },
			{ detailed_retention_hours: Number.MAX_SAFE_INTEGER, aggregation_retention_days: Number.MAX_SAFE_INTEGER },
		],
		invalidPayloads: [
			{},
			{ detailed_retention_hours: 24 },
			{ aggregation_retention_days: 35 },
			{ detailed_retention_hours: 0, aggregation_retention_days: 35 },
			{ detailed_retention_hours: 24, aggregation_retention_days: -1 },
			{ detailed_retention_hours: 1.5, aggregation_retention_days: 35 },
			{ detailed_retention_hours: 24, aggregation_retention_days: 1.5 },
			{ detailed_retention_hours: Number.MAX_SAFE_INTEGER + 1, aggregation_retention_days: 35 },
			{ detailed_retention_hours: 24, aggregation_retention_days: Number.MAX_SAFE_INTEGER + 1 },
			{ detailed_retention_hours: "invalid", aggregation_retention_days: 35 },
			{ detailed_retention_hours: 24, aggregation_retention_days: 35, meta: {} },
			{ detailed_retention_hours: 24, aggregation_retention_days: 35, beautifier_enabled: true },
		],
	},
	{
		path: "/settings/nginx-options",
		validPayloads: [{ beautifier_enabled: true }, { beautifier_enabled: false }],
		invalidPayloads: [
			{},
			{ beautifier_enabled: "invalid" },
			{ beautifier_enabled: {} },
			{ beautifier_enabled: [] },
			{ beautifier_enabled: true, meta: {} },
			{ beautifier_enabled: false, detailed_retention_hours: 24 },
		],
	},
];

let schema;

beforeAll(async () => {
	schema = await getCompiledSchema();
});

for (const { path, validPayloads, invalidPayloads } of contracts) {
	describe(`${path} API contract`, () => {
		it.each(validPayloads)("accepts complete supported options %j", async (payload) => {
			await expect(apiValidator(getValidationSchema(path, "put"), { ...payload })).resolves.toEqual(payload);
			for (const method of ["get", "put"]) {
				const responseSchema = schema.paths[path][method].responses[200].content["application/json"].schema;
				await expect(apiValidator(responseSchema, { ...payload })).resolves.toEqual(payload);
			}
		});

		it.each(invalidPayloads)("rejects incomplete or unsupported options %j", async (payload) => {
			await expect(apiValidator(getValidationSchema(path, "put"), { ...payload })).rejects.toThrow();
			for (const method of ["get", "put"]) {
				const responseSchema = schema.paths[path][method].responses[200].content["application/json"].schema;
				await expect(apiValidator(responseSchema, { ...payload })).rejects.toThrow();
			}
		});

		it("documents administrative access to application options", () => {
			for (const method of ["get", "put"]) {
				expect(schema.paths[path][method].security).toEqual([{ bearerAuth: ["admin"] }]);
			}
		});
	});
}
