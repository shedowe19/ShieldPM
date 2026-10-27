import { describe, expect, it } from "vitest";
import { removeRetiredHostHooks } from "../../lib/retired-host-config.js";
import { access, authentication, configuration, custom, headers } from "../fixtures/retired-host-config.js";

describe("upgrade of retired generated host hooks", () => {
	it("removes exact generated hooks while preserving authorization and custom directives byte for byte", () => {
		const original = `# custom prefix\n${headers}${authentication}${access}${custom}`;
		expect(removeRetiredHostHooks(original)).toBe(`# custom prefix\n${authentication}${custom}`);
		expect(removeRetiredHostHooks(`${authentication}${custom}`)).toBe(`${authentication}${custom}`);
	});
	it("supports multiple generated locations with the same chain and preserves Windows newlines", () => {
		const original = `${headers}${authentication}${access}${custom}`.repeat(2).replaceAll("\n", "\r\n");
		expect(removeRetiredHostHooks(original)).toBe(`${authentication}${custom}`.repeat(2).replaceAll("\n", "\r\n"));
	});
	it.each([
		`${headers}${access}`.replace("wasm_dispatcher.body_filter()", "custom_filter()"),
		`${headers}${access}`.replace(
			"wasm_dispatcher = dofile(wasm_path)",
			"wasm_dispatcher = custom_loader(wasm_path)",
		),
		headers,
		access,
		`${headers}${access}`.replace(
			`wasm_dispatcher.access("${configuration}")`,
			'wasm_dispatcher.access("/data/custom.json")',
		),
		"# ShieldPM Wasm configuration: invalid\n",
	])("rejects ambiguous modified generated configuration instead of removing authorization: %#", (content) => {
		expect(() => removeRetiredHostHooks(content)).toThrow("requires regeneration before restore");
	});
	it("leaves custom dispatcher-like variables and unrelated file execution untouched", () => {
		const original = 'local wasm_path = "/data/custom.lua"\nlocal wasm_dispatcher = dofile(wasm_path)\n';
		expect(removeRetiredHostHooks(original)).toBe(original);
	});
});
