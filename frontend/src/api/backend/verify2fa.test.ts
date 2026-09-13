import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/modules/AuthStore", () => ({
	AUTHENTICATION_EXPIRED_EVENT: "shieldpm:authentication-expired",
	default: {
		csrfToken: "csrf-token",
		clear: vi.fn(),
		setCsrfToken: vi.fn(),
	},
}));

import { begin2faDuoAuth, complete2faDuoAuth } from "./verify2fa";

describe("Duo authentication API", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => vi.unstubAllGlobals());

	it("starts the browser-bound challenge with the pending token and normal cookie/CSRF handling", async () => {
		const authUrl = "https://duo.example.com/authorize?state=returned-state";
		vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ auth_url: authUrl }), { status: 200 }));

		await expect(begin2faDuoAuth("pending-token")).resolves.toEqual({ authUrl });
		expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/tokens/2fa/duo/begin", {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": "csrf-token" },
			body: JSON.stringify({ pending_token: "pending-token" }),
			signal: undefined,
			credentials: "include",
		});
	});

	it("completes using only code/state in the body and includes browser cookies plus the CSRF header", async () => {
		const response = { expires: "2026-09-07T12:15:00Z" };
		vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));

		await expect(complete2faDuoAuth("duo-code", "returned-state")).resolves.toEqual(response);
		expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/tokens/2fa/duo/complete", {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": "csrf-token" },
			body: JSON.stringify({ duo_code: "duo-code", state: "returned-state" }),
			signal: undefined,
			credentials: "include",
		});
	});

	it("propagates a rejected browser-bound challenge to the callback", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ error: { message: "Invalid or expired Duo session" } }), { status: 400 }),
		);

		await expect(complete2faDuoAuth("duo-code", "returned-state")).rejects.toThrow(
			"Invalid or expired Duo session",
		);
		expect(fetch).toHaveBeenCalledOnce();
	});
});
