import { queryClient } from "src/api/queryClient";
import AuthStore from "src/modules/AuthStore";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acknowledgeDatabaseFailure, getDatabaseOperation, switchDatabase } from "./database";

afterEach(() => {
	vi.unstubAllGlobals();
	AuthStore.clear();
	queryClient.clear();
});
describe("database operation transport", () => {
	it("keeps the capability out of URLs and response data", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				Response.json({ id: "op", state: "running", phase: "copying", operationToken: "must-not-be-cached" }),
			);
		vi.stubGlobal("fetch", fetchMock);
		const value = await getDatabaseOperation("op", "synthetic-private-capability");
		expect(fetchMock.mock.calls[0][0]).toBe("/api/database/operation?id=op");
		expect(fetchMock.mock.calls[0][1].headers["X-Database-Operation-Token"]).toBe("synthetic-private-capability");
		expect(value).not.toHaveProperty("operationToken");
	});
	it("refreshes CSRF before acknowledging a failed operation and sends both headers", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ csrfToken: "current-csrf" }))
			.mockResolvedValueOnce(Response.json({ state: "cancelled" }));
		vi.stubGlobal("fetch", fetchMock);
		await acknowledgeDatabaseFailure("op", "synthetic-private-capability");
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/", "/api/database/operation/cancel"]);
		const request = fetchMock.mock.calls[1][1];
		expect(request.credentials).toBe("include");
		expect(request.headers["X-XSRF-TOKEN"]).toBe("current-csrf");
		expect(request.headers["X-Database-Operation-Token"]).toBe("synthetic-private-capability");
		expect(JSON.parse(request.body)).toEqual({ id: "op" });
	});
	it("sends explicit migration and exclusive-writer confirmations with credentials only in the body", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			Response.json({
				id: "op",
				state: "requested",
				phase: "requested",
				operationToken: "synthetic-private-capability",
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		await switchDatabase({ engine: "pg", host: "db.invalid", password: "synthetic-password" });
		expect(fetchMock.mock.calls[0][0]).toBe("/api/database/switch");
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
			target: { engine: "pg", host: "db.invalid", password: "synthetic-password" },
			confirm: true,
			confirmExclusive: true,
		});
	});
});
