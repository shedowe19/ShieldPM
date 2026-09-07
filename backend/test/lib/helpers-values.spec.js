import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/config.js", () => ({ isPostgres: () => true }));

import { convertIntFieldsToBool, parseDatePeriod } from "../../lib/helpers.js";

describe("database boolean and token period compatibility", () => {
	it("preserves PostgreSQL native booleans as well as SQLite/MySQL integer values", () => {
		const row = {
			pg_enabled: true,
			pg_disabled: false,
			sqlite_enabled: 1,
			sqlite_disabled: 0,
			text_enabled: "1",
			text_disabled: "0",
		};
		expect(convertIntFieldsToBool(row, Object.keys(row))).toEqual({
			pg_enabled: true,
			pg_disabled: false,
			sqlite_enabled: true,
			sqlite_disabled: false,
			text_enabled: true,
			text_disabled: false,
		});
	});
	it.each(["prefix\n1d", "1d\nsuffix", "1d\n", undefined, null, 12])(
		"rejects malformed token lifetimes %s",
		(value) => {
			expect(parseDatePeriod(value)).toBeNull();
		},
	);
	it("retains valid millisecond and day lifetime units", () => {
		expect(parseDatePeriod("12ms").isValid()).toBe(true);
		expect(parseDatePeriod("1d").isValid()).toBe(true);
	});
});
