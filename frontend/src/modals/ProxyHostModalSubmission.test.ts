import { describe, expect, it } from "vitest";
import { createProxyHostInitialValues, type ProxyHostFormValues } from "./ProxyHostModalFormValues";
import { createProxyHostPayload } from "./ProxyHostModalSubmission";

const createValues = (overrides: Partial<ProxyHostFormValues> = {}): ProxyHostFormValues => ({
	...createProxyHostInitialValues(),
	...overrides,
});

describe("createProxyHostPayload", () => {
	it("serializes local maintenance times as absolute timestamps and clears an empty end", () => {
		const payload = createProxyHostPayload({
			id: 73,
			values: createValues({ maintenanceStart: "2026-07-12T09:30:00", maintenanceEnd: "" }),
		});
		expect(payload.maintenanceStart).toBe(new Date(2026, 6, 12, 9, 30, 0).toISOString());
		expect(payload.maintenanceEnd).toBeNull();
	});
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

	it("never resubmits stored terminal secrets during an unrelated host edit", () => {
		const values = createProxyHostInitialValues({
			terminalPassword: "stored-password",
			terminalPrivateKey: "stored-key",
		});
		expect(values.terminalPassword).toBe("");
		expect(values.terminalPrivateKey).toBe("");
		const payload = createProxyHostPayload({ id: 73, values });
		expect(payload).not.toHaveProperty("terminalPassword");
		expect(payload).not.toHaveProperty("terminalPrivateKey");
	});

	it("allows explicitly entered replacement terminal credentials", () => {
		const payload = createProxyHostPayload({ id: 73, values: createValues({ terminalPassword: "replacement" }) });
		expect(payload.terminalPassword).toBe("replacement");
	});

	it("normalizes invalid rate-limit values before submission", () => {
		const payload = createProxyHostPayload({
			id: 73,
			values: createValues({ advLimitReqBurst: "not-a-number", advLimitReqRate: "" }),
		});

		expect(payload).toMatchObject({ advLimitReqBurst: undefined, advLimitReqRate: null });
	});

	it("retains cleared rate limits in the serialized update so stored limits are removed", () => {
		const payload = createProxyHostPayload({
			id: 73,
			values: createValues({ advLimitReqBurst: "", advLimitReqRate: "" }),
		});

		expect(JSON.parse(JSON.stringify(payload))).toMatchObject({ advLimitReqBurst: null, advLimitReqRate: null });
	});

	it("serializes numerical inputs as numbers and omits non-finite values", () => {
		const payload = createProxyHostPayload({
			id: 73,
			values: createValues({ advLimitReqRate: "20", advLimitReqBurst: Number.POSITIVE_INFINITY }),
		});

		expect(payload.advLimitReqRate).toBe(20);
		expect(JSON.parse(JSON.stringify(payload))).not.toHaveProperty("advLimitReqBurst");
	});

	it("loads and preserves custom PHP configuration during unrelated host edits", () => {
		const payload = createProxyHostPayload({
			id: 73,
			values: { ...createProxyHostInitialValues({ phpOverrideIni: "memory_limit=512M" }), note: "Updated note" },
		});

		expect(payload.phpOverrideIni).toBe("memory_limit=512M");
		expect(payload).not.toHaveProperty("php_override_ini");
	});

	it("sets an identifier only when editing an existing host", () => {
		const payload = createProxyHostPayload({
			id: "new",
			values: createValues(),
		});

		expect(payload).toHaveProperty("id", undefined);
	});
});
