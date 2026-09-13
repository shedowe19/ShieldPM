import { beforeAll, describe, expect, it } from "vitest";
import apiValidator from "../../lib/validator/api.js";
import { getCompiledSchema, getValidationSchema } from "../../schema/index.js";

let createSchema;
let updateSchema;
let certificateResponseSchema;
let uploadResponseSchema;

beforeAll(async () => {
	const schema = await getCompiledSchema();
	createSchema = getValidationSchema("/nginx/certificates", "post");
	updateSchema = getValidationSchema("/nginx/certificates/{certID}", "put");
	certificateResponseSchema =
		schema.paths["/nginx/certificates"].post.responses[201].content["application/json"].schema;
	uploadResponseSchema =
		schema.paths["/nginx/certificates/{certID}/upload"].post.responses[200].content["application/json"].schema;
});

describe("certificate API validation", () => {
	it.each(["letsencrypt", "internal"])("requires domains before issuing a %s certificate", async (provider) => {
		await expect(apiValidator(createSchema, { provider })).rejects.toThrow(/domain_names/);
		await expect(apiValidator(createSchema, { provider, domain_names: [] })).rejects.toThrow(/domain_names/);
	});

	it("allows a custom certificate placeholder before its PEM upload", async () => {
		await expect(
			apiValidator(createSchema, { provider: "other", nice_name: "Custom certificate" }),
		).resolves.toMatchObject({
			provider: "other",
		});
	});

	it.each(["localhost", "*.internal", "xn--bcher-kva.example", "bücher.example"])(
		"allows the supported hostname %s",
		async (domain) => {
			await expect(
				apiValidator(createSchema, { provider: "internal", domain_names: [domain], meta: { years: 10 } }),
			).resolves.toMatchObject({ domain_names: [domain] });
		},
	);

	it.each([
		"test.example/invalid",
		"test.example;return 200",
		"test.example\n",
		"test..example",
		"-test.example",
		"test-.example",
		"test.*.example",
		`${"a".repeat(64)}.example`,
	])("rejects a malformed hostname %j before issuance", async (domain) => {
		await expect(apiValidator(createSchema, { provider: "letsencrypt", domain_names: [domain] })).rejects.toThrow(
			/domain_names/,
		);
	});

	it.each([
		{ dns_challenge: true },
		{ dns_challenge: "true" },
		{ dns_challenge: true, dns_provider: "cloudflare" },
		{ dns_challenge: true, dns_provider_credentials: "dns_cloudflare_api_token = placeholder" },
		{ dns_challenge: true, dns_provider: "", dns_provider_credentials: "placeholder" },
		{ dns_challenge: true, dns_provider: "cloudflare", dns_provider_credentials: " \n\t" },
	])("requires usable DNS challenge settings: %j", async (meta) => {
		await expect(
			apiValidator(createSchema, { provider: "letsencrypt", domain_names: ["example.test"], meta }),
		).rejects.toThrow(/dns_provider/);
	});

	it("accepts zero-second DNS propagation and does not require DNS credentials for HTTP", async () => {
		await expect(
			apiValidator(createSchema, {
				provider: "letsencrypt",
				domain_names: ["example.test"],
				meta: {
					dns_challenge: true,
					dns_provider: "cloudflare",
					dns_provider_credentials: "dns_cloudflare_api_token = placeholder",
					propagation_seconds: 0,
				},
			}),
		).resolves.toMatchObject({ meta: { propagation_seconds: 0 } });
		await expect(
			apiValidator(createSchema, {
				provider: "letsencrypt",
				domain_names: ["example.test"],
				meta: { dns_challenge: false },
			}),
		).resolves.toMatchObject({ meta: { dns_challenge: false } });
	});

	it.each([0, 1.5, 11])("rejects internal validity %s outside the PKI contract", async (years) => {
		await expect(
			apiValidator(createSchema, { provider: "internal", domain_names: ["localhost"], meta: { years } }),
		).rejects.toThrow(/years/);
	});

	it("allows renaming without resubmitting a provider, while requiring the route ID", async () => {
		await expect(apiValidator(updateSchema, { id: 1, nice_name: "Renamed" })).resolves.toEqual({
			id: 1,
			nice_name: "Renamed",
		});
		await expect(apiValidator(updateSchema, { provider: "other" })).rejects.toThrow(/id/);
	});

	it("documents sanitized certificate responses separately from private request metadata", async () => {
		const response = {
			id: 1,
			created_on: "2026-09-07T00:00:00.000Z",
			modified_on: "2026-09-07T00:00:00.000Z",
			owner_user_id: 1,
			provider: "other",
			nice_name: "Custom certificate",
			domain_names: ["Example organization", "example.test"],
			expires_on: "2027-09-07T00:00:00.000Z",
			meta: { certificate: true, certificate_key: true, intermediate_certificate: true },
		};
		await expect(apiValidator(certificateResponseSchema, response)).resolves.toEqual(response);
		await expect(
			apiValidator(certificateResponseSchema, {
				...response,
				meta: { certificate_key: "PRIVATE PEM CONTENT" },
			}),
		).rejects.toThrow(/certificate_key/);
		await expect(
			apiValidator(certificateResponseSchema, {
				...response,
				meta: { dns_provider_credentials: "private token" },
			}),
		).rejects.toThrow(/additional properties/);
	});

	it("documents upload results as presence flags", async () => {
		await expect(apiValidator(uploadResponseSchema, { certificate: true, certificate_key: true })).resolves.toEqual(
			{ certificate: true, certificate_key: true },
		);
		await expect(
			apiValidator(uploadResponseSchema, { certificate: "PEM CONTENT", certificate_key: "PRIVATE PEM CONTENT" }),
		).rejects.toThrow();
	});
});
