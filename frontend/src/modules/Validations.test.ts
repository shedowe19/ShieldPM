import { intl } from "src/locale";
import { describe, expect, it } from "vitest";
import { validateDomains, validateOptionalNumber } from "./Validations";

describe("validateDomains", () => {
	it("accepts the advertised maximum domain count and rejects the next entry", () => {
		const validate = validateDomains(false, 2);
		expect(validate(["one.example.test", "two.example.test"])).toBeUndefined();
		expect(validate(["one.example.test", "two.example.test", "three.example.test"])).toBe(
			intl.formatMessage({ id: "error.max-domains" }, { max: 2 }),
		);
	});
});

describe("validateOptionalNumber", () => {
	it("allows an omitted optional number", () => {
		const validateForwardPort = validateOptionalNumber(1, 65535);

		expect(validateForwardPort("")).toBeUndefined();
	});

	it("rejects a forwarding port below the schema minimum", () => {
		const validateForwardPort = validateOptionalNumber(1, 65535);

		expect(validateForwardPort("0")).toBe(intl.formatMessage({ id: "error.minimum" }, { min: 1 }));
	});
});
