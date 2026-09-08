import Ajv from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { getCompiledSchema } from "../../schema/index.js";

const schema = await getCompiledSchema();
const ajv = new Ajv({ strict: false, validateFormats: false });
const response = (path, method = "get") => schema.paths[path][method].responses[200].content["application/json"].schema;
const accepts = (contract, payload) => {
	const validate = ajv.compile(contract);
	expect(validate(payload), JSON.stringify(validate.errors)).toBe(true);
};

describe("published host and certificate contracts", () => {
	it("accepts both proxy-host collection modes returned by getAll", () => {
		const contract = response("/nginx/proxy-hosts");
		accepts(contract, []);
		accepts(contract, { items: [], pagination: { limit: 20, page: 1, totalItems: 0, totalPages: 0 } });
	});

	it("exposes the proxy-host search and pagination query parameters", () => {
		const parameters = schema.paths["/nginx/proxy-hosts"].get.parameters;
		expect(parameters.map((parameter) => parameter.name)).toEqual(
			expect.arrayContaining(["query", "page", "limit"]),
		);
		const limit = ajv.compile(parameters.find((parameter) => parameter.name === "limit").schema);
		expect(limit(100)).toBe(true);
		expect(limit(101)).toBe(false);
	});

	it("accepts the Git status returned after updating Git configuration", () => {
		// updateConfig returns getStatus rather than a full proxy-host row.
		const status = {
			git_repo_url: null,
			git_branch: "main",
			git_sync_enabled: false,
			git_poll_interval: 60,
			git_poll_unit: "s",
			git_last_sync: null,
			git_last_commit: null,
			git_last_error: null,
			polling_active: false,
		};
		accepts(response("/nginx/proxy-hosts/{hostID}/git-status", "put"), status);
	});

	it("publishes certificate retrieval using the registered POST route and body", () => {
		expect(schema.paths["/nginx/certificates/{certID}"].get).toBeUndefined();
		const operation = schema.paths["/nginx/certificates/retrieve"]?.post;
		expect(operation).toBeDefined();
		const contract = operation.requestBody.content["application/json"].schema;
		accepts(contract, { id: 2, expand: ["owner", "proxy_hosts"] });
		const validate = ajv.compile(contract);
		expect(validate({})).toBe(false);
		expect(validate({ id: 0 })).toBe(false);
		expect(validate({ id: 1.5 })).toBe(false);
	});

	it.each([
		{ certificate_key: true },
		{
			certificate: {
				issuer: "CN = Example CA",
				sans: ["example.test"],
				dates: { from: 1700000000, to: 2000000000 },
			},
		},
		{
			intermediate_certificate: {
				cn: "Example CA",
				issuer: "CN = Root CA",
				sans: [],
				dates: { from: 1700000000, to: 2000000000 },
			},
		},
	])("accepts certificate validation results for independently supplied files: %j", (result) => {
		accepts(response("/nginx/certificates/validate", "post"), result);
	});

	it("documents independent validation uploads and certificate replacement with the existing key", () => {
		const multipart = (path) => schema.paths[path].post.requestBody.content["multipart/form-data"].schema;
		accepts(multipart("/nginx/certificates/validate"), { certificate_key: "private-key.pem" });
		accepts(multipart("/nginx/certificates/{certID}/upload"), { certificate: "certificate.pem" });
		expect(ajv.compile(multipart("/nginx/certificates/validate"))({})).toBe(false);
		expect(ajv.compile(multipart("/nginx/certificates/{certID}/upload"))({ certificate_key: "key.pem" })).toBe(
			false,
		);
	});

	it("accepts sanitized certificate relation expansions returned by get and getAll", () => {
		const certificate =
			schema.paths["/nginx/certificates/{certID}"].put.responses[200].content["application/json"].examples.default
				.value;
		accepts(response("/nginx/certificates/{certID}", "put"), {
			...certificate,
			meta: {},
			proxy_hosts: [],
			redirection_hosts: [],
			dead_hosts: [],
			streams: [],
		});
	});

	it("accepts nonsecret metadata retained on legacy certificates", () => {
		const certificate =
			schema.paths["/nginx/certificates/{certID}"].put.responses[200].content["application/json"].examples.default
				.value;
		accepts(response("/nginx/certificates/{certID}", "put"), certificate);
	});

	it.each(["adv_limit_req_unit", "terminal_auth_type"])("accepts the nullable persisted host field %s", (field) => {
		const host = schema.paths["/nginx/proxy-hosts/{hostID}"].get.responses[200].content["application/json"].schema;
		accepts(host.properties[field], null);
	});
});
