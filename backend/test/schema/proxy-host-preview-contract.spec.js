import { beforeAll, describe, expect, it } from "vitest";
import apiValidator from "../../lib/validator/api.js";
import { getCompiledSchema, getValidationSchema } from "../../schema/index.js";

describe("Proxy host preview API contracts", () => {
	beforeAll(async () => {
		await getCompiledSchema();
	});

	it("requires the same validated fields and rejects extra input as host creation", async () => {
		const schema = getValidationSchema("/nginx/proxy-hosts/preview", "post");
		expect(schema).toEqual(getValidationSchema("/nginx/proxy-hosts", "post"));
		await expect(
			apiValidator(schema, {
				domain_names: ["app.test"],
				forward_scheme: "http",
				forward_host: "backend",
				forward_port: 80,
			}),
		).resolves.toBeTruthy();
		await expect(
			apiValidator(schema, {
				domain_names: ["app.test"],
				forward_scheme: "http",
				forward_host: "backend",
				forward_port: 80,
				other_host_id: 42,
			}),
		).rejects.toThrow();
	});

	it("requires the same validated input for host updates", () => {
		expect(getValidationSchema("/nginx/proxy-hosts/{hostID}/preview", "post")).toEqual(
			getValidationSchema("/nginx/proxy-hosts/{hostID}", "put"),
		);
	});

	it("rejects Nginx and Lua syntax in interpolated host fields", async () => {
		const schema = getValidationSchema("/nginx/proxy-hosts", "post");
		const base = {
			domain_names: ["app.test"],
			forward_scheme: "http",
			forward_host: "backend.test",
			forward_port: 80,
		};
		await expect(apiValidator(schema, { ...base, bandwidth_limit: '1m"; os.execute("id")' })).rejects.toThrow();
		await expect(apiValidator(schema, { ...base, forward_query: "$http_authorization" })).rejects.toThrow();
		await expect(apiValidator(schema, { ...base, index_file: "../../etc/passwd" })).rejects.toThrow();
		await expect(
			apiValidator(schema, {
				...base,
				locations: [
					{
						path: "/app; return 200",
						forward_scheme: "http",
						forward_host: "backend.test",
						forward_port: 80,
					},
				],
			}),
		).rejects.toThrow();
	});
});
