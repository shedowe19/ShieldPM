import { describe, expect, it } from "vitest";
import { createProxyHostInitialValues, type ProxyHostFormValues } from "./ProxyHostModalFormValues";
import { createProxyHostPayload } from "./ProxyHostModalSubmission";

const createValues = (overrides: Partial<ProxyHostFormValues> = {}): ProxyHostFormValues => ({
	...createProxyHostInitialValues(),
	...overrides,
});

describe("createProxyHostPayload", () => {
	it("maps the CrowdSec form field to the API field", () => {
		const payload = createProxyHostPayload({
			id: 73,
			values: createValues({ crowdsecEnabled: true }),
		});

		expect(payload).toMatchObject({ id: 73, securityCrowdsec: true });
		expect(payload).not.toHaveProperty("crowdsecEnabled");
	});

	it("omits unchanged empty Git credentials", () => {
		const payload = createProxyHostPayload({
			id: 73,
			values: createValues({ gitCredentials: "" }),
		});

		expect(payload).not.toHaveProperty("gitCredentials");
	});

	it("normalizes invalid rate-limit values before submission", () => {
		const payload = createProxyHostPayload({
			id: 73,
			values: createValues({ advLimitReqBurst: "not-a-number", advLimitReqRate: "" }),
		});

		expect(payload).toMatchObject({ advLimitReqBurst: undefined, advLimitReqRate: undefined });
	});

	it("sets an identifier only when editing an existing host", () => {
		const payload = createProxyHostPayload({
			id: "new",
			values: createValues(),
		});

		expect(payload).toHaveProperty("id", undefined);
	});
});
