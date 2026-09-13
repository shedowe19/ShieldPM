import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import PACKAGE from "../../package.json" with { type: "json" };
import { getCompiledSchema } from "../../schema/index.js";

const schema = await getCompiledSchema();
const ajv = new Ajv({ strict: false, validateFormats: false });
const responseSchema = (path, method = "get", status = "200") =>
	schema.paths[path][method].responses[status].content["application/json"].schema;

describe("published API response contracts", () => {
	it("reports the running application version to all schema consumers", () => {
		expect(schema.info.version).toBe(PACKAGE.version);
	});
	it("defines every security scheme referenced by an operation", () => {
		for (const [path, item] of Object.entries(schema.paths)) {
			for (const operation of Object.values(item)) {
				for (const requirement of operation.security || []) {
					for (const name of Object.keys(requirement)) {
						expect(schema.components.securitySchemes, `${path}: ${name}`).toHaveProperty(name);
					}
				}
			}
		}
	});
	it("accepts the health bootstrap including demo mode and CSRF token", () => {
		const validate = ajv.compile(responseSchema("/"));
		expect(validate({ status: "OK", setup: true, version: PACKAGE.version, demo: false, csrfToken: "csrf" })).toBe(
			true,
		);
	});
	it("describes access-list collections as arrays", () => {
		const validate = ajv.compile(responseSchema("/nginx/access-lists"));
		expect(validate([])).toBe(true);
		expect(validate({})).toBe(false);
	});
	it.each(["/tokens", "/tokens/refresh", "/tokens/2fa/verify", "/tokens/2fa/passkey/complete"])(
		"accepts issued token pairs at %s",
		(path) => {
			const validate = ajv.compile(responseSchema(path, "post"));
			expect(
				validate({
					token: "access-token",
					expires: "2026-09-08T00:00:00Z",
					user: {
						id: 1,
						name: "Admin",
						email: "admin@example.test",
						nickname: "admin",
						avatar: "",
						roles: ["admin"],
					},
					csrfToken: "csrf",
				}),
			).toBe(true);
		},
	);
	it("describes logout as an empty 204 response", () => {
		expect(schema.paths["/tokens/logout"].post.responses).toEqual({
			204: expect.objectContaining({ description: expect.any(String) }),
		});
	});
	it("uses the actual error envelope, including optional translation keys", () => {
		for (const item of Object.values(schema.paths)) {
			for (const operation of Object.values(item)) {
				for (const [status, response] of Object.entries(operation.responses || {})) {
					const contract = response.content?.["application/json"]?.schema;
					if (Number(status) >= 400 && contract) {
						expect(
							ajv.compile(contract)({
								error: { code: 401, message: "Denied", message_i18n: "error.denied" },
							}),
						).toBe(true);
					}
				}
			}
		}
	});
});
