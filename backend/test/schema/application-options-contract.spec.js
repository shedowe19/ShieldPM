import { beforeAll, describe, expect, it } from "vitest";
import apiValidator from "../../lib/validator/api.js";
import { getCompiledSchema, getValidationSchema } from "../../schema/index.js";

const contracts = [
	{
		path: "/settings/certificate-options",
		validPayloads: [
			{ key_type: "ecdsa", renewal_interval_hours: 1 },
			{ key_type: "rsa", renewal_interval_hours: 12 },
		],
		invalidPayloads: [
			{},
			{ key_type: "ecdsa" },
			{ renewal_interval_hours: 12 },
			{ key_type: "RSA", renewal_interval_hours: 12 },
			{ key_type: "ed25519", renewal_interval_hours: 12 },
			{ key_type: "rsa", renewal_interval_hours: 0 },
			{ key_type: "rsa", renewal_interval_hours: 13 },
			{ key_type: "rsa", renewal_interval_hours: 1.5 },
			{ key_type: "rsa", renewal_interval_hours: "invalid" },
			{ key_type: "rsa", renewal_interval_hours: 12, meta: {} },
			{ key_type: "rsa", renewal_interval_hours: 12, enabled: true },
		],
	},
	{
		path: "/settings/ip-ranges-options",
		validPayloads: [
			{ enabled: false, refresh_interval_hours: 6 },
			{ enabled: true, refresh_interval_hours: 594 },
			{ enabled: true, refresh_interval_hours: 24 },
		],
		invalidPayloads: [
			{},
			{ enabled: true },
			{ refresh_interval_hours: 6 },
			{ enabled: "invalid", refresh_interval_hours: 6 },
			{ enabled: {}, refresh_interval_hours: 6 },
			{ enabled: true, refresh_interval_hours: 0 },
			{ enabled: true, refresh_interval_hours: 5 },
			{ enabled: true, refresh_interval_hours: 600 },
			{ enabled: true, refresh_interval_hours: 7 },
			{ enabled: true, refresh_interval_hours: 6.5 },
			{ enabled: true, refresh_interval_hours: "invalid" },
			{ enabled: true, refresh_interval_hours: 6, meta: {} },
			{ enabled: true, refresh_interval_hours: 6, key_type: "rsa" },
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

		it("documents administrative access for both reads and writes", () => {
			for (const method of ["get", "put"]) {
				expect(schema.paths[path][method].security).toEqual([{ bearerAuth: ["admin"] }]);
			}
		});
	});
}
