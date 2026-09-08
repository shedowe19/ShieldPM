import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("src/components/AnimatedPage", () => ({
	AnimatedPage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("src/components/LoadingPage", () => ({ LoadingPage: () => <div>Loading</div> }));
vi.mock("src/components/Page", () => ({
	Page: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("src/components/Sidebar", () => ({ Sidebar: () => null }));
vi.mock("src/components/SiteContainer", () => ({
	SiteContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("src/components/SiteFooter", () => ({ SiteFooter: () => null }));
vi.mock("src/components/SiteHeader", () => ({ SiteHeader: () => null }));
vi.mock("src/pages/Dashboard", () => ({ default: () => <div>Authenticated dashboard</div> }));
vi.mock("src/pages/Login", () => ({ default: () => <div>Sign in</div> }));

import { queryClient } from "src/api/queryClient";
import { AuthProvider, useAuthState } from "src/context/AuthContext";
import AuthStore from "src/modules/AuthStore";
import Router from "./Router";

function AuthState() {
	const { authenticated, loading } = useAuthState();
	return <output data-testid="auth-state">{loading ? "loading" : `ready:${authenticated}`}</output>;
}

afterEach(() => {
	cleanup();
	queryClient.clear();
	AuthStore.clear();
	vi.unstubAllGlobals();
	window.history.replaceState({}, "", "/");
});

describe("Duo callback after a full document reload", () => {
	it("obtains CSRF through health before the callback POST, with no competing refresh", async () => {
		queryClient.clear();
		AuthStore.clear();
		expect(AuthStore.csrfToken).toBeNull();
		window.history.replaceState({}, "", "/duo-callback?duo_code=duo-code&state=returned-state");

		let finishHealth: (response: Response) => void = () => {};
		let finishCallback: (response: Response) => void = () => {};
		const pendingHealth = new Promise<Response>((resolve) => {
			finishHealth = resolve;
		});
		const pendingCallback = new Promise<Response>((resolve) => {
			finishCallback = resolve;
		});
		const health = { status: "OK", setup: true, csrfToken: "duo-bootstrap-csrf" };
		let healthRequests = 0;
		const fetchMock = vi.fn((url: RequestInfo | URL) => {
			if (url === "/api/") {
				healthRequests += 1;
				return healthRequests === 1 ? pendingHealth : Promise.resolve(Response.json(health));
			}
			if (url === "/api/tokens/2fa/duo/complete") {
				return pendingCallback;
			}
			throw new Error(`Unexpected request: ${String(url)}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		render(
			<StrictMode>
				<QueryClientProvider client={queryClient}>
					<AuthProvider>
						<AuthState />
						<Router />
					</AuthProvider>
				</QueryClientProvider>
			</StrictMode>,
		);

		await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/",
			expect.objectContaining({ method: "GET", credentials: "include" }),
		);
		expect(AuthStore.csrfToken).toBeNull();
		expect(screen.getByTestId("auth-state")).toHaveTextContent("ready:false");
		expect(screen.getByText("Loading")).toBeInTheDocument();

		await act(async () => finishHealth(Response.json(health)));

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/tokens/2fa/duo/complete",
				expect.objectContaining({
					method: "POST",
					headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": "duo-bootstrap-csrf" },
					body: JSON.stringify({ duo_code: "duo-code", state: "returned-state" }),
					credentials: "include",
				}),
			),
		);
		expect(AuthStore.csrfToken).toBe("duo-bootstrap-csrf");
		expect(window.location.search).toBe("");
		expect(screen.getByTestId("auth-state")).toHaveTextContent("ready:false");

		await act(async () => {
			finishCallback(Response.json({ expires: Date.now() + 900_000, user: { id: 1 } }));
		});

		expect(await screen.findByText("Authenticated dashboard")).toBeInTheDocument();
		expect(screen.getByTestId("auth-state")).toHaveTextContent("ready:true");
		expect(AuthStore.active).toBe(true);
		expect(window.location.pathname).toBe("/");
		expect(fetchMock.mock.calls.filter(([url]) => url === "/api/tokens/2fa/duo/complete")).toHaveLength(1);
		expect(fetchMock.mock.calls.some(([url]) => url === "/api/tokens/refresh")).toBe(false);
	});
});
