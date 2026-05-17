import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";

/**
 * Fix #67: Knex patch() returns row count (number), not an object.
 * Using `!updatedRows` is unreliable with certain DB adapters.
 * Must use `updatedRows === 0` instead.
 */

describe("Fix #67: patch() return value check must use === 0", () => {
	it("source contains updatedRows === 0 (not !updatedRows)", async () => {
		const source = fs.readFileSync(
			"/Projekte/ShieldPM/backend/internal/auth-session-service.js",
			"utf8",
		);
		expect(source).toContain("updatedRows === 0");
		expect(source).not.toContain("if (!updatedRows)");
	});

	it("race condition check uses explicit zero comparison", async () => {
		const source = fs.readFileSync(
			"/Projekte/ShieldPM/backend/internal/auth-session-service.js",
			"utf8",
		);
		// The buggy pattern `if (!updatedRows)` must be gone
		expect(source).not.toMatch(/if \(!updatedRows\)/);
	});
});