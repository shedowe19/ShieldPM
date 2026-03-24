import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock AuthStore before importing base
vi.mock("src/modules/AuthStore", () => ({
	default: {
		csrfToken: "test-csrf-token",
		setCsrfToken: vi.fn(),
		clear: vi.fn(),
	},
}));

import { del, get, post, put } from "./base";

describe("API base client", () => {
	const mockFetch = vi.fn();

	beforeEach(() => {
		vi.stubGlobal("fetch", mockFetch);
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	const mockJsonResponse = (data: object, ok = true, status = 200) => {
		mockFetch.mockResolvedValueOnce({
			ok,
			status,
			json: () => Promise.resolve(data),
		} as unknown as Response);
	};

	describe("get", () => {
		it("calls fetch with correct URL and method", async () => {
			mockJsonResponse({ result: "ok" });
			await get({ url: "health" });
			expect(mockFetch).toHaveBeenCalledTimes(1);
			const [url, opts] = mockFetch.mock.calls[0];
			expect(url).toBe("/api/health");
			expect(opts.method).toBe("GET");
		});

		it("includes CSRF token in headers", async () => {
			mockJsonResponse({ result: "ok" });
			await get({ url: "health" });
			const [, opts] = mockFetch.mock.calls[0];
			expect(opts.headers["X-XSRF-TOKEN"]).toBe("test-csrf-token");
		});

		it("appends query params (decamelized)", async () => {
			mockJsonResponse({ result: "ok" });
			await get({ url: "hosts", params: { sortBy: "name" } });
			const [url] = mockFetch.mock.calls[0];
			expect(url).toContain("sort_by=name");
		});

		it("camelizes response keys", async () => {
			mockJsonResponse({ my_key: "value" });
			const result = await get({ url: "test" });
			expect(result).toHaveProperty("myKey", "value");
		});

		it("throws on non-ok response", async () => {
			mockJsonResponse({ error: { message: "Not found" } }, false, 404);
			await expect(get({ url: "missing" })).rejects.toThrow("Not found");
		});
	});

	describe("post", () => {
		it("sends JSON body with decamelized keys", async () => {
			mockJsonResponse({ id: 1 });
			await post({ url: "hosts", data: { forwardHost: "example.com" } });
			const [, opts] = mockFetch.mock.calls[0];
			expect(opts.method).toBe("POST");
			const body = JSON.parse(opts.body);
			expect(body).toHaveProperty("forward_host", "example.com");
		});

		it("sets Content-Type to application/json for object data", async () => {
			mockJsonResponse({ id: 1 });
			await post({ url: "hosts", data: { name: "test" } });
			const [, opts] = mockFetch.mock.calls[0];
			expect(opts.headers["Content-Type"]).toBe("application/json");
		});

		it("sends raw keys when rawKeys is true", async () => {
			mockJsonResponse({ id: 1 });
			await post({ url: "webauthn", data: { clientDataJSON: "abc" }, rawKeys: true });
			const [, opts] = mockFetch.mock.calls[0];
			const body = JSON.parse(opts.body);
			expect(body).toHaveProperty("clientDataJSON", "abc");
		});
	});

	describe("put", () => {
		it("sends PUT request", async () => {
			mockJsonResponse({ id: 1 });
			await put({ url: "hosts/1", data: { name: "updated" } });
			const [, opts] = mockFetch.mock.calls[0];
			expect(opts.method).toBe("PUT");
		});
	});

	describe("del", () => {
		it("sends DELETE request", async () => {
			mockJsonResponse({ success: true });
			await del({ url: "hosts/1" });
			const [, opts] = mockFetch.mock.calls[0];
			expect(opts.method).toBe("DELETE");
		});
	});
});
