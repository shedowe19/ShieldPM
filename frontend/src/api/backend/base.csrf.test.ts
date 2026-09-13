import { queryClient } from "src/api/queryClient";
import AuthStore from "src/modules/AuthStore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadPost, post, put } from "./base";

const deferredResponse = () => {
	let resolve!: (response: Response) => void;
	const promise = new Promise<Response>((done) => {
		resolve = done;
	});
	return { promise, resolve };
};

const csrfFailure = () =>
	Response.json({ error: { code: 403, reason: "EBADCSRFTOKEN", message: "Invalid CSRF token" } }, { status: 403 });

beforeEach(() => {
	AuthStore.clear();
	AuthStore.set({ expires: Date.now() + 900_000, user: { id: 1 } });
	AuthStore.setCsrfToken("old-csrf");
});

afterEach(() => {
	queryClient.clear();
	AuthStore.clear();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("recovery from an explicit CSRF rejection before route execution", () => {
	it("gets fresh CSRF and repeats the original write once with the same body", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(csrfFailure())
			.mockResolvedValueOnce(Response.json({ csrfToken: "fresh-csrf" }))
			.mockResolvedValueOnce(Response.json({ id: 7, name: "Saved" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(put({ url: "/users/7", data: { name: "Saved" } })).resolves.toMatchObject({ id: 7 });
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/users/7", "/api/", "/api/users/7"]);
		const original = fetchMock.mock.calls[0][1];
		const retried = fetchMock.mock.calls[2][1];
		expect(retried.method).toBe("PUT");
		expect(retried.body).toBe(original.body);
		expect(retried.credentials).toBe("include");
		expect(new Headers(retried.headers).get("X-XSRF-TOKEN")).toBe("fresh-csrf");
	});

	it("does not repeat an ordinary permission-denied response", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(Response.json({ error: { code: 403, message: "Permission denied" } }, { status: 403 }));
		vi.stubGlobal("fetch", fetchMock);
		await expect(post({ url: "/users", data: { name: "Saved" } })).rejects.toThrow("Permission denied");
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("stops after a second explicit CSRF rejection", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(csrfFailure())
			.mockResolvedValueOnce(Response.json({ csrfToken: "fresh-csrf" }))
			.mockResolvedValueOnce(csrfFailure());
		vi.stubGlobal("fetch", fetchMock);
		await expect(post({ url: "/users", data: { name: "Saved" } })).rejects.toThrow("Invalid CSRF token");
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("does not replay a previous account's write after a session change during recovery", async () => {
		const health = deferredResponse();
		const fetchMock = vi.fn().mockResolvedValueOnce(csrfFailure()).mockReturnValueOnce(health.promise);
		vi.stubGlobal("fetch", fetchMock);
		const pending = expect(post({ url: "/users", data: { name: "Saved" } })).rejects.toThrow("Invalid CSRF token");
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		AuthStore.set({ expires: Date.now() + 900_000, user: { id: 2 } });
		AuthStore.setCsrfToken("new-account-csrf");
		health.resolve(Response.json({ csrfToken: "old-account-recovery-csrf" }));
		await pending;
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(AuthStore.csrfToken).toBe("new-account-csrf");
	});

	it("does not start recovery when the rejection arrives after a newer login", async () => {
		const response = deferredResponse();
		const fetchMock = vi.fn().mockReturnValue(response.promise);
		vi.stubGlobal("fetch", fetchMock);
		const pending = expect(post({ url: "/users", data: { name: "Saved" } })).rejects.toThrow("Invalid CSRF token");
		AuthStore.set({ expires: Date.now() + 900_000, user: { id: 2 } });
		AuthStore.setCsrfToken("new-account-csrf");
		response.resolve(csrfFailure());
		await pending;
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(AuthStore.csrfToken).toBe("new-account-csrf");
	});

	it("does not replay an upload after its request was cancelled during recovery", async () => {
		const controller = new AbortController();
		const health = deferredResponse();
		const fetchMock = vi.fn().mockResolvedValueOnce(csrfFailure()).mockReturnValueOnce(health.promise);
		vi.stubGlobal("fetch", fetchMock);
		const pending = expect(post({ url: "/users/1/avatar", data: new FormData() }, controller)).rejects.toThrow();
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		controller.abort();
		health.resolve(Response.json({ csrfToken: "fresh-csrf" }));
		await pending;
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("reuses FormData without setting a multipart boundary or losing the selected file", async () => {
		const data = new FormData();
		data.append("avatar", new File(["image bytes"], "avatar.png", { type: "image/png" }));
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(csrfFailure())
			.mockResolvedValueOnce(Response.json({ csrfToken: "fresh-csrf" }))
			.mockResolvedValueOnce(Response.json({ id: 1 }));
		vi.stubGlobal("fetch", fetchMock);
		await post({ url: "/users/1/avatar", data });
		const retried = fetchMock.mock.calls[2][1];
		expect(retried.body).toBe(data);
		expect((retried.body as FormData).get("avatar")).toBeInstanceOf(File);
		expect(new Headers(retried.headers).has("Content-Type")).toBe(false);
	});

	it("recovers an authenticated POST download before creating its file", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(csrfFailure())
			.mockResolvedValueOnce(Response.json({ csrfToken: "fresh-csrf" }))
			.mockResolvedValueOnce(new Response("download bytes"));
		vi.stubGlobal("fetch", fetchMock);
		const createObjectURL = vi.fn(() => "blob:download");
		vi.spyOn(URL, "createObjectURL").mockImplementation(createObjectURL);
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
		await downloadPost({ url: "/nginx/certificates/internal/client", data: { name: "client" } }, "client.p12");
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(createObjectURL).toHaveBeenCalledOnce();
	});
});
