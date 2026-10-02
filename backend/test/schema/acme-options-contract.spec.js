import Ajv from "ajv/dist/2020.js";
import { beforeAll, describe, expect, it } from "vitest";
import { getCompiledSchema, getValidationSchema } from "../../schema/index.js";

const ordinary = {
	server: "https://acme-v02.api.letsencrypt.org/directory",
	email: "",
	account_id: "",
	eab_kid: "",
	agree_tos: true,
	must_staple: false,
	ocsp_stapling: false,
	server_tls_verify: true,
	custom_ocsp_stapling: false,
	default_certificate_id: 0,
};
const publicOptions = { ...ordinary, eab_hmac_key_set: false };
const path = "/settings/acme-options";
const ajv = new /** @type {any} */ (Ajv)({ allErrors: true, coerceTypes: false, strict: false });
let schema;
let validateRequest;
let validateResponses;
let validateSetting;
let validateSettingList;

beforeAll(async () => {
	schema = await getCompiledSchema();
	validateRequest = ajv.compile(getValidationSchema(path, "put"));
	validateResponses = ["get", "put"].map((method) =>
		ajv.compile(schema.paths[path][method].responses[200].content["application/json"].schema),
	);
	validateSetting = ajv.compile(
		schema.paths["/settings/{settingID}"].get.responses[200].content["application/json"].schema,
	);
	validateSettingList = ajv.compile(schema.paths["/settings"].get.responses[200].content["application/json"].schema);
});

describe("ACME options request contract without type coercion", () => {
	it.each([
		ordinary,
		{ ...ordinary, email: "account@example.test", account_id: "Account_id-42", eab_kid: "synthetic-kid" },
		{ ...ordinary, server: "http://ca.example.test/directory", default_certificate_id: Number.MAX_SAFE_INTEGER },
		{ ...ordinary, eab_hmac_key: "SYNTHETIC_REPLACEMENT_KEY" },
		{ ...ordinary, eab_hmac_key: "SYNTHETIC_PADDED_KEY==" },
		{ ...ordinary, eab_hmac_key: null },
		{ ...ordinary, agree_tos: false },
	])("accepts complete ordinary fields and explicit retain/replace/clear choices %j", (payload) => {
		const original = structuredClone(payload);
		expect(validateRequest(payload)).toBe(true);
		expect(payload).toEqual(original);
	});

	it.each(Object.keys(ordinary))("requires the ordinary field %s", (key) => {
		const payload = { ...ordinary };
		delete payload[key];
		expect(validateRequest(payload)).toBe(false);
	});

	it.each([
		{ ...ordinary, server: "" },
		{ ...ordinary, server: "ftp://ca.example.test/directory" },
		{ ...ordinary, server: "https://ca.example.test/ directory" },
		{ ...ordinary, email: "invalid-email" },
		{ ...ordinary, email: "a@@b" },
		{ ...ordinary, email: "a@b" },
		{ ...ordinary, eab_kid: "bad kid" },
		{ ...ordinary, eab_kid: "bad\u0000kid" },
		{ ...ordinary, account_id: "../account" },
		{ ...ordinary, account_id: "account/id" },
		{ ...ordinary, account_id: "account id" },
		{ ...ordinary, eab_hmac_key: "" },
		{ ...ordinary, eab_hmac_key: "   " },
		{ ...ordinary, eab_hmac_key: "SYNTHETIC_KEY!" },
		{ ...ordinary, eab_hmac_key: false },
		{ ...ordinary, eab_hmac_key: 123 },
		{ ...ordinary, eab_hmac_key: {} },
		{ ...ordinary, eab_hmac_key: [] },
		{ ...ordinary, agree_tos: "true" },
		{ ...ordinary, must_staple: 1 },
		{ ...ordinary, ocsp_stapling: "false" },
		{ ...ordinary, server_tls_verify: null },
		{ ...ordinary, custom_ocsp_stapling: "true" },
		{ ...ordinary, default_certificate_id: -1 },
		{ ...ordinary, default_certificate_id: 1.5 },
		{ ...ordinary, default_certificate_id: "42" },
		{ ...ordinary, default_certificate_id: Number.MAX_SAFE_INTEGER + 1 },
		{ ...ordinary, eab_hmac_key_set: false },
		{ ...ordinary, encrypted_eab_hmac_key: "SYNTHETIC_CIPHERTEXT" },
		{ ...ordinary, meta: {} },
		{ ...ordinary, value: "configured" },
	])("rejects malformed options, secret markers, private envelopes and coercible values %j", (payload) => {
		const original = structuredClone(payload);
		expect(validateRequest(payload)).toBe(false);
		expect(payload).toEqual(original);
	});

	it("documents secret actions without allowing the public status marker to be written", () => {
		const request = getValidationSchema(path, "put");
		expect(request.properties.eab_hmac_key.writeOnly).toBe(true);
		expect(request.required).not.toContain("eab_hmac_key");
		expect(request.properties).not.toHaveProperty("eab_hmac_key_set");
		expect(request.properties).not.toHaveProperty("encrypted_eab_hmac_key");
	});
});

describe("public ACME options response contract", () => {
	it.each([
		publicOptions,
		{ ...publicOptions, eab_hmac_key_set: true },
		{ ...publicOptions, server: "LEGACY_INVALID_SERVER", email: "LEGACY_INVALID_EMAIL", account_id: "legacy/id" },
		{ ...publicOptions, eab_kid: "partial-kid", eab_hmac_key_set: false, agree_tos: false },
	])("keeps ordinary legacy fields repairable and returns only a secret marker %j", (payload) => {
		for (const validate of validateResponses) expect(validate(payload)).toBe(true);
	});

	it.each([
		{ ...publicOptions, eab_hmac_key: "SYNTHETIC_PLAINTEXT" },
		{ ...publicOptions, encrypted_eab_hmac_key: "SYNTHETIC_CIPHERTEXT" },
		{ ...publicOptions, eab_hmac_key_set: "false" },
		{ ...publicOptions, meta: {} },
	])("rejects private secrets, ciphertext and unsupported response fields %j", (payload) => {
		for (const validate of validateResponses) expect(validate(payload)).toBe(false);
	});

	it.each(Object.keys(publicOptions))("requires the public field %s", (key) => {
		const payload = { ...publicOptions };
		delete payload[key];
		for (const validate of validateResponses) expect(validate(payload)).toBe(false);
	});

	it("rejects secret leakage through generic settings and settings-list responses", () => {
		const row = {
			id: "acme-options",
			name: "ACME Options",
			description: "Public account options",
			value: "configured",
			meta: publicOptions,
		};
		expect(validateSetting(row)).toBe(true);
		expect(validateSettingList([row])).toBe(true);
		for (const privateField of ["eab_hmac_key", "encrypted_eab_hmac_key"]) {
			const leaked = { ...row, meta: { ...publicOptions, [privateField]: "SYNTHETIC_PRIVATE_VALUE" } };
			expect(validateSetting(leaked)).toBe(false);
			expect(validateSettingList([leaked])).toBe(false);
		}
	});

	it("documents administrative access and read-only secret presence", () => {
		for (const method of ["get", "put"]) {
			expect(schema.paths[path][method].security).toEqual([{ bearerAuth: ["admin"] }]);
			const response = schema.paths[path][method].responses[200].content["application/json"].schema;
			expect(response.properties.eab_hmac_key_set.readOnly).toBe(true);
		}
	});
});
