import AuthStore from "src/modules/AuthStore";
import { afterEach, expect, it, vi } from "vitest";
import { post } from "./base";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	window.localStorage.clear();
	AuthStore.clear();
});
it.each([
	"/tokens",
	"/tokens/logout",
	"/tokens/restore",
	"/users/2/login",
	"/oidc/claim",
	"/tokens/2fa/verify",
	"/tokens/2fa/passkey/complete",
	"/tokens/2fa/duo/complete",
])("orders %s after cookie rotation and rejects refreshes during identity changes", async (endpoint) => {
	let finish!: () => void;
	const started: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			started.push(url);
			if (started.length === 1)
				await new Promise<void>((resolve) => {
					finish = resolve;
				});
			return new Response("{}", { status: 200 });
		}),
	);
	const refresh = post({ url: "/tokens/refresh", silentAuth: true });
	const change = post({ url: endpoint });
	await expect(post({ url: "/tokens/refresh", silentAuth: true })).rejects.toThrow("Authentication is changing");
	expect(started).toEqual(["/api/tokens/refresh"]);
	finish();
	await Promise.all([refresh, change]);
	expect(started).toEqual(["/api/tokens/refresh", `/api${endpoint}`]);
	await post({ url: "/tokens/refresh", silentAuth: true });
	expect(started[started.length - 1]).toBe("/api/tokens/refresh");
});
it("keeps unrelated API requests concurrent while authentication is pending", async () => {
	let finish!: () => void;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			if (url === "/api/tokens")
				await new Promise<void>((resolve) => {
					finish = resolve;
				});
			return new Response("{}", { status: 200 });
		}),
	);
	const login = post({ url: "/tokens" });
	await post({ url: "/settings" });
	finish();
	await login;
});
it("drains a failed auth response before allowing the next identity mutation", async () => {
	vi.stubGlobal(
		"fetch",
		vi
			.fn()
			.mockRejectedValueOnce(new Error("Network failed"))
			.mockResolvedValueOnce(new Response("{}", { status: 200 })),
	);
	const first = post({ url: "/tokens/refresh", silentAuth: true });
	const second = post({ url: "/tokens" });
	await expect(first).rejects.toThrow("Network failed");
	await expect(second).resolves.toEqual({});
});

it("publishes a successful session on HTTP browsers without crypto.randomUUID", async () => {
	vi.stubGlobal("crypto", { randomUUID: undefined });
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue(new Response(JSON.stringify({ expires: 123, user: { id: 1 } }), { status: 200 })),
	);
	await expect(post({ url: "/tokens" })).resolves.toEqual({ expires: 123, user: { id: 1 } });
});
it("uses the browser-wide lock and tolerates a policy denying its acquisition", async () => {
	const request = vi.fn().mockRejectedValue(new DOMException("Denied", "SecurityError"));
	vi.stubGlobal("navigator", { locks: { request } });
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
	await expect(post({ url: "/tokens" })).resolves.toEqual({});
	expect(request).toHaveBeenCalledWith("shieldpm:authentication", { mode: "exclusive" }, expect.any(Function));
	expect(fetch).toHaveBeenCalledOnce();
});
