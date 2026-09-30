import { beforeAll, describe, expect, it } from "vitest";
import apiValidator from "../../lib/validator/api.js";
import { getCompiledSchema, getValidationSchema } from "../../schema/index.js";

let operation;
let updateSchema;

beforeAll(async () => {
	operation = (await getCompiledSchema()).paths["/nginx/certificates/acme-profile"];
	updateSchema = getValidationSchema("/nginx/certificates/acme-profile", "put");
});

describe("global ACME profile API contract", () => {
	it.each(["standard", "shortlived"])("accepts saving the %s profile", async (profile) => {
		await expect(apiValidator(updateSchema, { profile })).resolves.toEqual({ profile });
	});

	it.each(["", "inherit", "classic", "SHORTLIVED", "standard --server https://example.test", null, true, 7, {}, []])(
		"rejects unsupported profile %j",
		async (profile) => {
			await expect(apiValidator(updateSchema, { profile })).rejects.toThrow(/profile/);
		},
	);

	it("requires a profile and rejects changes to read-only response fields", async () => {
		await expect(apiValidator(updateSchema, {})).rejects.toThrow(/profile/);
		for (const field of ["source", "environmentProfile", "meta", "value"]) {
			await expect(apiValidator(updateSchema, { profile: "standard", [field]: "unexpected" })).rejects.toThrow(
				/additional properties/,
			);
		}
	});

	it.each(["get", "put"])("documents %s responses with effective profiles and their source", async (method) => {
		const responseSchema = operation[method].responses[200].content["application/json"].schema;
		for (const profile of ["standard", "shortlived"]) {
			for (const source of ["environment", "settings"]) {
				await expect(apiValidator(responseSchema, { profile, source })).resolves.toEqual({ profile, source });
				await expect(
					apiValidator(responseSchema, { profile, source, environmentProfile: "custom-acme-profile" }),
				).resolves.toEqual({ profile, source, environmentProfile: "custom-acme-profile" });
			}
		}
		await expect(apiValidator(responseSchema, { profile: "standard" })).rejects.toThrow(/source/);
		await expect(apiValidator(responseSchema, { source: "settings" })).rejects.toThrow(/profile/);
		await expect(apiValidator(responseSchema, { profile: "inherit", source: "environment" })).rejects.toThrow(
			/profile/,
		);
		await expect(apiValidator(responseSchema, { profile: "standard", source: "unknown" })).rejects.toThrow(
			/source/,
		);
		await expect(
			apiValidator(responseSchema, { profile: "standard", source: "settings", credentials: "private" }),
		).rejects.toThrow(/additional properties/);
	});

	it("documents certificate read permission and administrator-only writes", () => {
		expect(operation.get.security).toEqual([{ bearerAuth: ["certificates.view"] }]);
		expect(operation.put.security).toEqual([{ bearerAuth: ["admin"] }]);
	});
});
