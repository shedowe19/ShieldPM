import { intl } from "src/locale";
import { describe, expect, it } from "vitest";
import { validateOptionalNumber } from "./Validations";

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
