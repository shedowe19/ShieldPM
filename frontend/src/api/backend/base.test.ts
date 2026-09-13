import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/modules/AuthStore", () => ({
	AUTHENTICATION_EXPIRED_EVENT: "shieldpm:authentication-expired",
	default: {
		clear: vi.fn(),
		csrfToken: null,
		setCsrfToken: vi.fn(),
	},
}));

import { queryClient } from "src/api/queryClient";
import AuthStore from "src/modules/AuthStore";
import { del, download, downloadPost, get, post } from "./base";

describe("authenticated request failures", () => {
	const authenticationExpired = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		window.addEventListener("shieldpm:authentication-expired", authenticationExpired);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				json: vi.fn().mockResolvedValue({ error: { message: "Unauthorized" } }),
				ok: false,
				status: 401,
			}),
		);
	});

	afterEach(() => {
		window.removeEventListener("shieldpm:authentication-expired", authenticationExpired);
		vi.unstubAllGlobals();
	});

	it("notifies the application after an unauthorized response without relying on a document reload", async () => {
		await expect(get({ url: "nginx/proxy-hosts" })).rejects.toThrow("Unauthorized");

		expect(AuthStore.clear).toHaveBeenCalledOnce();
		expect(authenticationExpired).toHaveBeenCalledOnce();
	});

	it("expires authentication and cached data even when the unauthorized body is not JSON", async () => {
		queryClient.setQueryData(["profile"], { email: "admin@example.test" });
		vi.mocked(fetch).mockResolvedValue(new Response("<html>Unauthorized</html>", { status: 401 }));

		await expect(get({ url: "nginx/proxy-hosts" })).rejects.toThrow("HTTP 401");

		expect(AuthStore.clear).toHaveBeenCalledOnce();
		expect(authenticationExpired).toHaveBeenCalledOnce();
		expect(queryClient.getQueryData(["profile"])).toBeUndefined();
	});

	it("keeps silent authentication failures silent without preserving stale cache", async () => {
		queryClient.setQueryData(["profile"], { email: "admin@example.test" });
		vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));

		await expect(get({ url: "tokens/refresh", silentAuth: true })).rejects.toThrow("HTTP 401");

		expect(authenticationExpired).not.toHaveBeenCalled();
		expect(AuthStore.clear).toHaveBeenCalledOnce();
		expect(queryClient.getQueryData(["profile"])).toBeUndefined();
	});

	it.each([null, {}, { error: null }, { error: { message: 42 } }])(
		"reports the HTTP status for unexpected error payloads: %j",
		async (payload) => {
			vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(payload), { status: 502 }));
			await expect(get({ url: "nginx/proxy-hosts" })).rejects.toThrow("HTTP 502");
		},
	);

	it("preserves the backend's localized error key", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ error: { messageI18n: "error.permission", message: "Forbidden" } }), {
				status: 403,
			}),
		);
		await expect(get({ url: "nginx/proxy-hosts" })).rejects.toThrow("error.permission");
	});
});

describe("successful response bodies", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("accepts the empty logout response", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
		await expect(post({ url: "tokens/logout" })).resolves.toBeUndefined();
	});

	it("accepts empty DELETE responses", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
		await expect(del({ url: "tokens" })).resolves.toBeUndefined();
	});

	it("accepts JSON null without attempting to read a CSRF token from it", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("null", { status: 200 })));
		await expect(get({ url: "test" })).resolves.toBeNull();
	});

	it("continues to reject invalid JSON on successful data responses", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid", { status: 200 })));
		await expect(get({ url: "nginx/proxy-hosts" })).rejects.toThrow();
	});
});

describe("download", () => {
	const objectUrl = "blob:shieldpm-export";
	const createObjectURL = vi.fn(() => objectUrl);
	const revokeObjectURL = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				blob: vi.fn().mockResolvedValue(new Blob(["certificate export"])),
			}),
		);
		vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		createObjectURL.mockClear();
		revokeObjectURL.mockClear();
	});

	it("releases the generated Blob URL after starting a download", async () => {
		await download({ url: "nginx/certificates/1/download" }, "certificate.zip");

		expect(createObjectURL).toHaveBeenCalledOnce();
		expect(revokeObjectURL).toHaveBeenCalledOnce();
		expect(revokeObjectURL).toHaveBeenCalledWith(objectUrl);
	});

	it("rejects unauthorized downloads before creating a Blob URL", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				json: vi.fn().mockResolvedValue({ error: { message: "Unauthorized" } }),
			}),
		);

		await expect(download({ url: "nginx/certificates/1/download", silentAuth: true })).rejects.toThrow(
			"Unauthorized",
		);

		expect(AuthStore.clear).toHaveBeenCalledOnce();
		expect(createObjectURL).not.toHaveBeenCalled();
	});

	it("clears cached application data after an unauthorized download response", async () => {
		queryClient.setQueryData(["profile"], { email: "admin@example.test" });
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				json: vi.fn().mockResolvedValue({ error: { message: "Unauthorized" } }),
			}),
		);

		await expect(download({ url: "nginx/certificates/1/download", silentAuth: true })).rejects.toThrow(
			"Unauthorized",
		);

		expect(queryClient.getQueryData(["profile"])).toBeUndefined();
	});

	it("rejects unauthorized POST downloads before creating a Blob URL", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				json: vi.fn().mockResolvedValue({ error: { message: "Unauthorized" } }),
			}),
		);

		await expect(
			downloadPost({ url: "nginx/certificates/1/download", data: {}, silentAuth: true }),
		).rejects.toThrow("Unauthorized");

		expect(AuthStore.clear).toHaveBeenCalledOnce();
		expect(createObjectURL).not.toHaveBeenCalled();
	});
});
