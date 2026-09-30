import { beforeAll, describe, expect, it } from "vitest";
import apiValidator from "../../lib/validator/api.js";
import { getCompiledSchema, getValidationSchema } from "../../schema/index.js";

const profiles = ["standard", "shortlived"];
const invalidProfiles = ["", "classic", "SHORTLIVED", "shortlived --server https://example.test", null, 7, true];
const domainNames = (count) => Array.from({ length: count }, (_, index) => `host-${index}.example.test`);
const hostCases = [
	{
		route: "/nginx/proxy-hosts",
		payload: {
			domain_names: ["example.test"],
			forward_scheme: "http",
			forward_host: "127.0.0.1",
			forward_port: 8080,
		},
	},
	{
		route: "/nginx/redirection-hosts",
		payload: {
			domain_names: ["example.test"],
			forward_scheme: "https",
			forward_http_code: 301,
			forward_domain_name: "www.example.test",
		},
	},
	{ route: "/nginx/dead-hosts", payload: { domain_names: ["example.test"] } },
	{
		route: "/nginx/streams",
		resourceId: "streamID",
		payload: {
			incoming_port: "9443",
			forwarding_host: "127.0.0.1",
			forwarding_port: "8443",
			tcp_forwarding: true,
			udp_forwarding: false,
			domain_names: ["example.test"],
		},
	},
];

let createSchema;
let certificateResponseSchema;

beforeAll(async () => {
	const schema = await getCompiledSchema();
	createSchema = getValidationSchema("/nginx/certificates", "post");
	certificateResponseSchema =
		schema.paths["/nginx/certificates"].post.responses[201].content["application/json"].schema;
});

describe("Let's Encrypt certificate profile contracts", () => {
	it.each(profiles)("accepts the %s profile in certificate creation and sanitized responses", async (profile) => {
		const meta = { letsencrypt_profile: profile, dns_challenge: false };
		await expect(
			apiValidator(createSchema, { provider: "letsencrypt", domain_names: ["example.test"], meta }),
		).resolves.toMatchObject({ meta });
		await expect(
			apiValidator(certificateResponseSchema, {
				id: 1,
				created_on: "2026-09-29T00:00:00.000Z",
				modified_on: "2026-09-29T00:00:00.000Z",
				owner_user_id: 1,
				provider: "letsencrypt",
				nice_name: "example.test",
				domain_names: ["example.test"],
				expires_on: "2026-10-05T16:00:00.000Z",
				meta,
			}),
		).resolves.toMatchObject({ meta });
	});

	it("keeps requests without a profile compatible with resolving the global default", async () => {
		await expect(
			apiValidator(createSchema, { provider: "letsencrypt", domain_names: ["example.test"], meta: {} }),
		).resolves.toMatchObject({ meta: {} });
		expect(createSchema.properties.meta.properties.letsencrypt_profile.default).toBeUndefined();
	});

	it.each(invalidProfiles)("rejects unsupported certificate profile %j", async (profile) => {
		await expect(
			apiValidator(createSchema, {
				provider: "letsencrypt",
				domain_names: ["example.test"],
				meta: { letsencrypt_profile: profile },
			}),
		).rejects.toThrow(/letsencrypt_profile/);
	});

	it("enforces the shortlived 25-name limit without restricting the standard profile", async () => {
		await expect(
			apiValidator(createSchema, {
				provider: "letsencrypt",
				domain_names: domainNames(25),
				meta: { letsencrypt_profile: "shortlived" },
			}),
		).resolves.toMatchObject({ domain_names: domainNames(25) });
		await expect(
			apiValidator(createSchema, {
				provider: "letsencrypt",
				domain_names: domainNames(26),
				meta: { letsencrypt_profile: "shortlived" },
			}),
		).rejects.toThrow(/domain_names/);
		await expect(
			apiValidator(createSchema, {
				provider: "letsencrypt",
				domain_names: domainNames(26),
				meta: { letsencrypt_profile: "standard" },
			}),
		).resolves.toMatchObject({ domain_names: domainNames(26) });
		await expect(
			apiValidator(createSchema, { provider: "letsencrypt", domain_names: domainNames(26) }),
		).resolves.toMatchObject({ domain_names: domainNames(26) });
	});

	it.each(["other", "internal"])("rejects a Let's Encrypt profile for provider %s", async (provider) => {
		for (const profile of profiles) {
			await expect(
				apiValidator(createSchema, {
					provider,
					domain_names: ["example.test"],
					meta: { letsencrypt_profile: profile },
				}),
			).rejects.toThrow(/must NOT be valid/);
		}
	});
});

for (const { route, payload, resourceId = "hostID" } of hostCases) {
	for (const method of ["post", "put"]) {
		describe(`${method.toUpperCase()} ${route} inline certificate profile`, () => {
			const path = method === "post" ? route : `${route}/{${resourceId}}`;

			it.each(profiles)("accepts %s while retaining unrelated host metadata", async (profile) => {
				const meta = { letsencrypt_profile: profile, dns_challenge: false, nginx_online: true };
				await expect(
					apiValidator(getValidationSchema(path, method), { ...payload, certificate_id: "new", meta }),
				).resolves.toMatchObject({ certificate_id: "new", meta });
			});

			it("allows inline certificate creation with an omitted profile", async () => {
				await expect(
					apiValidator(getValidationSchema(path, method), {
						...payload,
						certificate_id: "new",
						meta: { dns_challenge: false },
					}),
				).resolves.toMatchObject({ certificate_id: "new", meta: { dns_challenge: false } });
			});

			it.each(invalidProfiles)("rejects unsupported inline profile %j", async (profile) => {
				await expect(
					apiValidator(getValidationSchema(path, method), {
						...payload,
						certificate_id: "new",
						meta: { letsencrypt_profile: profile },
					}),
				).rejects.toThrow(/letsencrypt_profile/);
			});

			it("limits a new shortlived certificate to 25 names", async () => {
				const request = {
					...payload,
					certificate_id: "new",
					domain_names: domainNames(25),
					meta: { letsencrypt_profile: "shortlived" },
				};
				await expect(apiValidator(getValidationSchema(path, method), request)).resolves.toMatchObject({
					domain_names: domainNames(25),
				});
				await expect(
					apiValidator(getValidationSchema(path, method), { ...request, domain_names: domainNames(26) }),
				).rejects.toThrow(/domain_names/);
			});

			it("keeps larger standard host requests and existing certificate assignments valid", async () => {
				for (const certificate of [
					{ certificate_id: "new", meta: { letsencrypt_profile: "standard" } },
					{ certificate_id: "new", meta: {} },
					{ certificate_id: 1, meta: { letsencrypt_profile: "shortlived" } },
				]) {
					await expect(
						apiValidator(getValidationSchema(path, method), {
							...payload,
							...certificate,
							domain_names: domainNames(26),
						}),
					).resolves.toMatchObject({ domain_names: domainNames(26) });
				}
			});
		});
	}
}

describe("serialized stream certificate payload", () => {
	it.each(profiles)(
		"preserves the %s profile and TLS names through JSON serialization and validation",
		async (profile) => {
			const stream = hostCases.find(({ route }) => route === "/nginx/streams").payload;
			const request = JSON.parse(
				JSON.stringify({
					...stream,
					certificate_id: "new",
					meta: { letsencrypt_profile: profile, dns_challenge: false },
				}),
			);
			for (const [path, method] of [
				["/nginx/streams", "post"],
				["/nginx/streams/{streamID}", "put"],
			]) {
				await expect(apiValidator(getValidationSchema(path, method), request)).resolves.toEqual(request);
				expect(request.meta.letsencrypt_profile).toBe(profile);
				expect(request.domain_names).toEqual(["example.test"]);
			}
		},
	);
});
