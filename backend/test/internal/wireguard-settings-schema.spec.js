import { beforeAll, describe, expect, it } from "vitest";
import apiValidator from "../../lib/validator/api.js";
import { getCompiledSchema, getValidationSchema } from "../../schema/index.js";

beforeAll(async () => {
	await getCompiledSchema();
});

describe("WireGuard settings API schema", () => {
	it("allows only a safe partial settings payload", async () => {
		const schema = getValidationSchema("/nginx/wireguard/settings", "put");
		const payload = {
			endpoint: "vpn.example.com",
			listen_port: 51820,
			server_address: "10.8.0.1/24",
			subnet: "10.8.0.0/24",
		};

		expect(schema).toEqual(expect.any(Object));
		await expect(apiValidator(schema, payload)).resolves.toEqual(payload);
	});

	it("rejects unknown fields and PostUp newline injection", async () => {
		const schema = getValidationSchema("/nginx/wireguard/settings", "put");

		await expect(
			apiValidator(schema, { endpoint: "vpn.example.com", post_up: "iptables -F" }),
		).rejects.toMatchObject({
			status: 400,
		});
		await expect(
			apiValidator(schema, { endpoint: "vpn.example.com\nPostUp = iptables -F FORWARD" }),
		).rejects.toMatchObject({
			status: 400,
		});
		await expect(apiValidator(schema, { subnet: "10.8.0.0/25" })).rejects.toMatchObject({ status: 400 });
	});
});
