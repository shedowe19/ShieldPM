import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/error.js", () => {
	class InternalValidationError extends Error {
		constructor(msg) {
			super(msg);
			this.name = "InternalValidationError";
			this.status = 400;
		}
	}
	return {
		default: { InternalValidationError },
	};
});

const validator = (await import("../../lib/validator/index.js")).default;

describe("validator/index", () => {
	const schema = {
		type: "object",
		properties: {
			id: { type: "integer", minimum: 1 },
			name: { type: "string" },
		},
		required: ["id"],
		additionalProperties: false,
	};

	it("returns a deep clone of valid payload", async () => {
		const payload = { id: 1, name: "test" };
		const result = await validator(schema, payload);
		expect(result).toEqual(payload);
		expect(result).not.toBe(payload); // deep clone
	});

	it("throws InternalValidationError for invalid payload", async () => {
		await expect(validator(schema, { name: "no-id" })).rejects.toThrow();
	});

	it("throws InternalValidationError for falsy payload", async () => {
		await expect(validator(schema, null)).rejects.toThrow("Payload is falsy");
	});

	it("throws InternalValidationError for empty string payload", async () => {
		await expect(validator(schema, "")).rejects.toThrow("Payload is falsy");
	});

	it("coerces types when possible", async () => {
		const result = await validator(schema, { id: "5" });
		expect(result.id).toBe(5);
	});
});
