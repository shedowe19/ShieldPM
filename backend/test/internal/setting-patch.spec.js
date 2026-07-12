import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

/**
 * Fix #73: setting.js — only allow value and meta fields in patch
 * Prevents injection of arbitrary columns like name, description, etc.
 */
describe("Fix #73: setting.js field whitelist", () => {
	let source;

	beforeEach(() => {
		source = fs.readFileSync(backendSourcePath("internal", "setting.js"), "utf8");
	});

	it("patches only value and meta fields (not full data object)", () => {
		// The patch call should only include value and meta
		expect(source).toContain("value: data.value");
		expect(source).toContain("meta: data.meta");
		// Should NOT patch the raw data object
		expect(source).not.toContain(".patch(data)");
	});

	it("audit log still reads name and description from updatedRow", () => {
		// The audit log uses updatedRow.name and updatedRow.description
		// This ensures those fields still come from the DB, not user input
		expect(source).toContain("name: updatedRow.name");
		expect(source).toContain("description: updatedRow.description");
	});
});
