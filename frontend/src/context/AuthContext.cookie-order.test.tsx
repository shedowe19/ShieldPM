import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
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
