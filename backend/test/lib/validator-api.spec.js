import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/error.js", () => {
	class ValidationError extends Error {
		constructor(msg) {
			super(msg);
			this.name = "ValidationError";
			this.status = 400;
			this.public = true;
		}
	}
	return {
		default: { ValidationError },
	};
});

const apiValidator = (await import("../../lib/validator/api.js")).default;

describe("validator/api", () => {
	const simpleSchema = {
		type: "object",
		properties: {
			name: { type: "string" },
			age: { type: "integer", minimum: 0 },
		},
		required: ["name"],
		additionalProperties: false,
	};

	it("returns payload for valid data", async () => {
		const payload = { name: "Alice", age: 30 };
		const result = await apiValidator(simpleSchema, payload);
		expect(result.name).toBe("Alice");
	});

	it("throws ValidationError for invalid data", async () => {
		await expect(apiValidator(simpleSchema, { age: 30 })).rejects.toThrow();
	});

	it("throws if schema is undefined", async () => {
		await expect(apiValidator(undefined, {})).rejects.toThrow("Schema is undefined");
	});

	it("throws if payload is undefined", async () => {
		await expect(apiValidator(simpleSchema, undefined)).rejects.toThrow("Payload is undefined");
	});

	it("blocks toxic keywords in advanced_config", async () => {
		const schema = { type: "object", properties: { advanced_config: { type: "string" } } };
		await expect(apiValidator(schema, { advanced_config: "lua_need_request_body on;" })).rejects.toThrow(
			"Toxic keyword",
		);
	});

	it("blocks alias keyword in advanced_config", async () => {
		const schema = { type: "object", properties: { advanced_config: { type: "string" } } };
		await expect(apiValidator(schema, { advanced_config: "alias /etc/passwd;" })).rejects.toThrow(
			"Toxic keyword",
		);
	});

	it("allows advanced_config without toxic keywords", async () => {
		const schema = { type: "object", properties: { advanced_config: { type: "string" } } };
		const result = await apiValidator(schema, { advanced_config: "proxy_read_timeout 300;" });
		expect(result.advanced_config).toBe("proxy_read_timeout 300;");
	});
});
