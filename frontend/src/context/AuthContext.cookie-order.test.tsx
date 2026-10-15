import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import * as api from "src/api/backend/base";
import AuthStore from "src/modules/AuthStore";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type AuthContextType, AuthProvider, useAuthState } from "./AuthContext";

const mocks = vi.hoisted(() => ({ useIntervalWhen: vi.fn() }));
vi.mock("rooks", () => ({ useIntervalWhen: mocks.useIntervalWhen }));
vi.mock("src/notifications", () => ({ showError: vi.fn() }));
let auth: AuthContextType;
let cookieIdentity: number | null;
let finishRefresh: (() => void) | undefined;
let holdRefresh: boolean;
let requests: string[];
let client: QueryClient;
const token = (id: number) => ({ expires: Date.now() + 900_000, user: { id } });
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
function Probe() {
	auth = useAuthState();
	return <output>{auth.loading ? "loading" : auth.authenticated ? "signed in" : "signed out"}</output>;
}
beforeEach(() => {
	vi.resetAllMocks();
	AuthStore.clear();
	window.localStorage.clear();
	window.history.replaceState({}, "", "/");
	client = new QueryClient();
	cookieIdentity = 1;
	holdRefresh = false;
	finishRefresh = undefined;
	requests = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string) => {
			requests.push(input);
			if (input === "/api/tokens/refresh") {
				if (holdRefresh)
					await new Promise<void>((resolve) => {
						finishRefresh = resolve;
					});
				// Model the browser applying Set-Cookie as the response arrives, before
				// JavaScript can reject a stale body with its generation guard.
				cookieIdentity = 1;
				return json(token(1));
			}
			if (input === "/api/tokens/2fa/duo/complete") return json(token(1));
			if (input === "/api/users/2/login") {
				cookieIdentity = 2;
				return json(token(2));
			}
			if (input === "/api/tokens/restore") return new Response("{}", { status: 401 });
			if (input === "/api/tokens/logout") {
				cookieIdentity = null;
				return new Response(null, { status: 204 });
			}
			if (input === "/api/users/me") return json({ id: cookieIdentity });
			throw new Error(`Unexpected request: ${input}`);
		}),
	);
});
afterEach(() => {
	cleanup();
	client.clear();
	AuthStore.clear();
	vi.unstubAllGlobals();
});

it.each(["impersonation", "logout"] as const)(
	"finishes an in-flight refresh before %s changes browser cookies",
	async (action) => {
		render(
			<QueryClientProvider client={client}>
				<AuthProvider>
					<Probe />
				</AuthProvider>
			</QueryClientProvider>,
		);
		await screen.findByText("signed in");
		holdRefresh = true;
		let refresh!: Promise<void>;
		act(() => {
			refresh = mocks.useIntervalWhen.mock.lastCall?.[0]();
		});
		expect(finishRefresh).toBeTypeOf("function");
		let change!: Promise<void>;
		act(() => {
			change = action === "impersonation" ? auth.loginAs(2) : Promise.resolve(auth.logout());
		});
		expect(requests).toEqual(["/api/tokens/refresh", "/api/tokens/refresh"]);
		await act(async () => {
			finishRefresh?.();
			await Promise.all([refresh, change]);
		});
		const identity = await api.get<{ id: number | null }>({ url: "/users/me" });
		expect(identity.id).toBe(action === "impersonation" ? 2 : null);
		expect(AuthStore.userId).toBe(action === "impersonation" ? 2 : 0);
		expect(AuthStore.isImpersonating).toBe(action === "impersonation");
		if (action === "logout") expect(screen.getByText("signed out")).toBeInTheDocument();
	},
);

it.each(["expired", "wrong cookie"] as const)(
	"verifies a persisted impersonation on reload and recovers an %s marker",
	async (reason) => {
		window.localStorage.setItem(
			"shieldpm:cookie-identity",
			JSON.stringify({
				revision: reason,
				sequence: Date.now(),
				expires: Date.now() + (reason === "expired" ? -1 : 900_000),
				userId: 2,
				impersonating: true,
			}),
		);
		render(
			<QueryClientProvider client={client}>
				<AuthProvider>
					<Probe />
				</AuthProvider>
			</QueryClientProvider>,
		);
		await screen.findByText("signed in");
		expect(AuthStore.userId).toBe(1);
		expect(AuthStore.isImpersonating).toBe(false);
		if (reason === "wrong cookie") expect(requests[0]).toBe("/api/users/me");
		expect(requests).toContain("/api/tokens/refresh");
	},
);

it("finishes a trusted login callback even when its cookie-identity verification is still pending", async () => {
	render(
		<QueryClientProvider client={client}>
			<AuthProvider>
				<Probe />
			</AuthProvider>
		</QueryClientProvider>,
	);
	await screen.findByText("signed in");
	let finishIdentity!: (response: Response) => void;
	const identity = new Promise<Response>((resolve) => {
		finishIdentity = resolve;
	});
	const original = vi.mocked(fetch).getMockImplementation();
	if (!original) throw new Error("Missing fetch fixture");
	vi.mocked(fetch).mockImplementation((input, options) =>
		input === "/api/users/me" ? identity : original(input, options),
	);
	await act(async () => {
		const response = await api.post<{ expires: number }>({ url: "/tokens/2fa/duo/complete" });
		auth.completeLogin(response);
	});
	expect(screen.getByText("signed in")).toBeInTheDocument();
	await act(async () => {
		finishIdentity(json({ id: 1 }));
		await identity;
	});
	expect(screen.getByText("signed in")).toBeInTheDocument();
});

it("reconciles its delivered login cookie after a different tab invalidates the original login callback", async () => {
	render(
		<QueryClientProvider client={client}>
			<AuthProvider>
				<Probe />
			</AuthProvider>
		</QueryClientProvider>,
	);
	await screen.findByText("signed in");
	let deliverLogin!: () => void;
	const loginResponse = new Promise<Response>((resolve) => {
		deliverLogin = () => {
			cookieIdentity = 2;
			resolve(json(token(2)));
		};
	});
	const original = vi.mocked(fetch).getMockImplementation();
	if (!original) throw new Error("Missing fetch fixture");
	vi.mocked(fetch).mockImplementation((input, options) =>
		input === "/api/tokens" ? loginResponse : original(input, options),
	);
	let login!: Promise<void>;
	act(() => {
		login = auth.login("target@example.test", "password");
	});
	cookieIdentity = 3;
	window.localStorage.setItem(
		"shieldpm:cookie-identity",
		JSON.stringify({
			revision: "other-tab-login",
			sequence: Date.now(),
			expires: Date.now() + 900_000,
			userId: 3,
			impersonating: false,
		}),
	);
	await act(async () => {
		window.dispatchEvent(new StorageEvent("storage", { key: "shieldpm:cookie-identity" }));
	});
	expect(AuthStore.userId).toBe(3);
	await act(async () => {
		deliverLogin();
		await login;
	});
	await screen.findByText("signed in");
	await waitFor(() => expect(AuthStore.userId).toBe(2));
	expect(await api.get({ url: "/users/me" })).toEqual({ id: 2 });
});
