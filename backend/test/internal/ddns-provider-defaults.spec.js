import { describe, expect, it, vi } from "vitest";

vi.mock("../../db.js", () => ({ default: () => ({}) }));
vi.mock("../../models/now_helper.js", () => ({ default: () => "2026-09-01 00:00:00" }));

import DdnsProvider from "../../models/ddns_provider.js";

describe("DDNS provider defaults", () => {
	it("supplies an explicit empty meta document before insertion", () => {
		const provider = new DdnsProvider();

		provider.$beforeInsert();

		expect(provider.meta).toEqual({});
	});

	it("preserves caller-provided meta before insertion", () => {
		const provider = new DdnsProvider();
		provider.meta = { source: "api" };

		provider.$beforeInsert();

		expect(provider.meta).toEqual({ source: "api" });
	});
});
