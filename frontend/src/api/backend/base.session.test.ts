import { queryClient } from "src/api/queryClient";
import AuthStore, { AUTHENTICATION_EXPIRED_EVENT } from "src/modules/AuthStore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { del, download, downloadPost, get, post, put } from "./base";

describe("API responses crossing session boundaries", () => {
	const expired = vi.fn();
	let finish: (response: Response) => void;

	beforeEach(() => {
		AuthStore.clear();
		AuthStore.setCsrfToken("old-csrf");
		AuthStore.set({ expires: Date.now() + 900_000, user: { id: 1 } });
		window.addEventListener(AUTHENTICATION_EXPIRED_EVENT, expired);
		vi.stubGlobal(
			"fetch",
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						finish = resolve;
					}),
			),
		);
	});

	afterEach(() => {
		window.removeEventListener(AUTHENTICATION_EXPIRED_EVENT, expired);
		expired.mockClear();
		queryClient.clear();
		AuthStore.clear();
		vi.unstubAllGlobals();
	});

	const requests = [
		["GET", () => get({ url: "/users/me" })],
		["POST", () => post({ url: "/tokens/refresh", silentAuth: true })],
		["PUT", () => put({ url: "/users/1", data: { name: "Old" } })],
		["DELETE", () => del({ url: "/nginx/proxy-hosts/1" })],
		["download", () => download({ url: "/nginx/certificates/root-ca" })],
		["POST download", () => downloadPost({ url: "/nginx/certificates/download", data: { id: 1 } })],
	] as const;

	it.each(requests)("does not expire a newer login after an old %s returns 401", async (_method, request) => {
		const pending = request();
		AuthStore.set({ expires: Date.now() + 900_000, user: { id: 2 } });
		AuthStore.setCsrfToken("new-csrf");
		queryClient.setQueryData(["user", "me"], { id: 2 });
		finish(
			new Response(JSON.stringify({ error: { message: "Old session expired" }, csrfToken: "stale-csrf" }), {
				status: 401,
			}),
		);

		await expect(pending).rejects.toThrow("Old session expired");
		expect(AuthStore.userId).toBe(2);
		expect(AuthStore.csrfToken).toBe("new-csrf");
		expect(queryClient.getQueryData(["user", "me"])).toEqual({ id: 2 });
		expect(expired).not.toHaveBeenCalled();
	});

	it("does not replace the current CSRF token with a delayed successful response", async () => {
		const pending = get({ url: "/users/me" });
		AuthStore.set({ expires: Date.now() + 900_000, user: { id: 2 } });
		AuthStore.setCsrfToken("new-csrf");
		finish(new Response(JSON.stringify({ id: 1, csrfToken: "old-response-csrf" })));
		await expect(pending).resolves.toMatchObject({ id: 1 });
		expect(AuthStore.csrfToken).toBe("new-csrf");
	});

	it("uses the anonymous CSRF response header immediately after an empty logout response", async () => {
		AuthStore.clear();
		const pending = post({ url: "/tokens/logout", silentAuth: true });
		finish(new Response(null, { status: 204, headers: { "X-XSRF-TOKEN": "anonymous-csrf" } }));
		await expect(pending).resolves.toBeUndefined();

		vi.mocked(fetch).mockResolvedValue(Response.json({}));
		await post({ url: "/oidc/claim" });
		expect(fetch).toHaveBeenLastCalledWith(
			"/api/oidc/claim",
			expect.objectContaining({ headers: expect.objectContaining({ "X-XSRF-TOKEN": "anonymous-csrf" }) }),
		);
	});

	it("ignores a delayed logout CSRF header after a newer login", async () => {
		const pending = post({ url: "/tokens/logout", silentAuth: true });
		AuthStore.set({ expires: Date.now() + 900_000, user: { id: 2 } });
		AuthStore.setCsrfToken("new-csrf");
		finish(new Response(null, { status: 204, headers: { "X-XSRF-TOKEN": "anonymous-csrf" } }));
		await pending;
		expect(AuthStore.csrfToken).toBe("new-csrf");
		expect(AuthStore.userId).toBe(2);
	});

	it("rechecks the session after asynchronously reading the response body", async () => {
		let finishBody: (value: unknown) => void = () => {};
		const response = {
			ok: true,
			status: 200,
			json: vi.fn(
				() =>
					new Promise((resolve) => {
						finishBody = resolve;
					}),
			),
		};
		const pending = get({ url: "/users/me" });
		finish(response as unknown as Response);
		await vi.waitFor(() => expect(response.json).toHaveBeenCalledOnce());
		AuthStore.set({ expires: Date.now() + 900_000, user: { id: 2 } });
		AuthStore.setCsrfToken("new-csrf");
		finishBody({ csrfToken: "old-body-csrf" });
		await pending;
		expect(AuthStore.csrfToken).toBe("new-csrf");
	});

	it("still expires the session that actually sent the failed request", async () => {
		queryClient.setQueryData(["user", "me"], { id: 1 });
		const pending = get({ url: "/users/me" });
		finish(new Response(null, { status: 401 }));
		await expect(pending).rejects.toThrow("HTTP 401");
		expect(AuthStore.active).toBe(false);
		expect(queryClient.getQueryData(["user", "me"])).toBeUndefined();
		expect(expired).toHaveBeenCalledOnce();
	});
});
