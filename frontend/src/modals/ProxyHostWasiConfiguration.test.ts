import { describe, expect, it } from "vitest";
import { applicationSettingsError } from "./ProxyHostWasiConfiguration";

describe("host WASI execution settings", () => {
	it.each([
		"",
		"{}",
		'{"args":["Case_sensitive"],"env":[{"name":"TenantID","value":"EXACT_value"}],"timeoutMs":100}',
		'{"timeoutMs":60000}',
	])("accepts supported settings %s", (value) => {
		expect(applicationSettingsError(value)).toBeUndefined();
	});
	it.each([
		"null",
		"[]",
		"broken",
		'{"stdin":"not a host setting"}',
		'{"args":[1]}',
		'{"args":null}',
		'{"env":null}',
		JSON.stringify({ args: ["nul\0value"] }),
		JSON.stringify({ args: ["é".repeat(2049)] }),
		JSON.stringify({ args: Array(33).fill("") }),
		'{"env":{}}',
		'{"env":[{"name":"SHIELDPM_HTTP_METHOD","value":"POST"}]}',
		'{"env":[{"name":"TenantID","value":"a"},{"name":"TenantID","value":"b"}]}',
		'{"env":[{"name":"bad-name","value":"x"}]}',
		'{"env":[{"name":"OK","value":1}]}',
		'{"timeoutMs":99}',
		'{"timeoutMs":60001}',
		'{"timeoutMs":1.5}',
		'{"timeoutMs":"1000"}',
	])("rejects invalid settings without losing the draft: %s", (value) => {
		expect(applicationSettingsError(value)).toBeTruthy();
	});
	it("counts UTF-8 bytes and C string separators in the combined input bound", () => {
		expect(applicationSettingsError(JSON.stringify({ args: Array(16).fill("a".repeat(4096)) }))).toMatch(/64 KiB/);
		expect(applicationSettingsError(JSON.stringify({ args: Array(16).fill("é".repeat(2047)) }))).toBeUndefined();
	});
});
