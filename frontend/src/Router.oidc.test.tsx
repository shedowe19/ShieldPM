import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";

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
vi.mock("src/components/LocalePicker", () => ({ LocalePicker: () => null }));
vi.mock("src/components/ThemeSwitcher", () => ({ ThemeSwitcher: () => null }));
vi.mock("src/pages/Dashboard", () => ({ default: () => <div>Authenticated dashboard</div> }));

import { queryClient } from "src/api/queryClient";
import { AuthProvider, useAuthState } from "src/context/AuthContext";
import AuthStore from "src/modules/AuthStore";
import Router from "./Router";

function AuthState() {
	const { authenticated, loading } = useAuthState();
	return <output data-testid="auth-state">{loading ? "loading" : `ready:${authenticated}`}</output>;
}

function deferredResponse() {
	let resolve!: (response: Response) => void;
	const promise = new Promise<Response>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

afterEach(() => {
	cleanup();
	queryClient.clear();
	AuthStore.clear();
	vi.unstubAllGlobals();
	window.history.replaceState({}, "", "/");
});

it("claims OIDC after callback cookie cleanup and the root redirect, then shows the new user's dashboard", async () => {
	queryClient.clear();
	AuthStore.clear();
	window.history.replaceState({}, "", "/");
	queryClient.setQueryData(["profile"], { id: 1, email: "previous@example.test" });
	const health = { status: "OK", setup: true, csrfToken: "oidc-bootstrap-csrf" };
	const pendingHealth = deferredResponse();
	const pendingRefresh = deferredResponse();
	const pendingClaim = deferredResponse();
	let healthRequests = 0;
	const fetchMock = vi.fn((url: RequestInfo | URL) => {
		if (url === "/api/") {
			healthRequests += 1;
			return healthRequests === 1 ? pendingHealth.promise : Promise.resolve(Response.json(health));
		}
		if (url === "/api/tokens/refresh") return pendingRefresh.promise;
		if (url === "/api/oidc/claim") return pendingClaim.promise;
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
	await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/tokens/refresh")).toBe(true));
	// A successful server callback has removed the previous browser's refresh cookie.
	await act(async () => {
		pendingRefresh.resolve(Response.json({ error: { message: "Missing refresh token" } }, { status: 400 }));
	});
	expect(screen.getByTestId("auth-state")).toHaveTextContent("ready:false");
	expect(fetchMock.mock.calls.some(([url]) => url === "/api/oidc/claim")).toBe(false);
	expect(screen.getByText("Loading")).toBeInTheDocument();

	await act(async () => {
		pendingHealth.resolve(Response.json(health));
	});
	await waitFor(() =>
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/oidc/claim",
			expect.objectContaining({
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": "oidc-bootstrap-csrf" },
			}),
		),
	);
	await act(async () => {
		pendingClaim.resolve(Response.json({ expires: Date.now() + 900_000, user: { id: 2 } }));
	});

	expect(await screen.findByText("Authenticated dashboard")).toBeInTheDocument();
	expect(screen.getByTestId("auth-state")).toHaveTextContent("ready:true");
	expect(AuthStore.userId).toBe(2);
	expect(queryClient.getQueryData(["profile"])).toBeUndefined();
	expect(window.location.pathname).toBe("/");
	expect(fetchMock.mock.calls.filter(([url]) => url === "/api/oidc/claim")).toHaveLength(1);
	expect(fetchMock.mock.calls.filter(([url]) => url === "/api/tokens/refresh")).toHaveLength(1);
});

it("keeps password login usable when no OIDC cookie is available", async () => {
	queryClient.clear();
	AuthStore.clear();
	window.history.replaceState({}, "", "/");
	const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
		if (url === "/api/") return Response.json({ status: "OK", setup: true, csrfToken: "password-csrf" });
		if (url === "/api/tokens/refresh" || url === "/api/oidc/claim") {
			return Response.json({ error: { message: "No session cookie" } }, { status: 400 });
		}
		if (url === "/api/tokens") return Response.json({ expires: Date.now() + 900_000, user: { id: 3 } });
		throw new Error(`Unexpected request: ${String(url)}`);
	});
	vi.stubGlobal("fetch", fetchMock);
	render(
		<StrictMode>
			<QueryClientProvider client={queryClient}>
				<AuthProvider>
					<Router />
				</AuthProvider>
			</QueryClientProvider>
		</StrictMode>,
	);
	fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: "user@example.test" } });
	fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-password" } });
	fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
	expect(await screen.findByText("Authenticated dashboard")).toBeInTheDocument();
	expect(AuthStore.userId).toBe(3);
	expect(fetchMock.mock.calls.filter(([url]) => url === "/api/oidc/claim")).toHaveLength(1);
	expect(fetchMock).toHaveBeenCalledWith(
		"/api/tokens",
		expect.objectContaining({
			method: "POST",
			body: JSON.stringify({ identity: "user@example.test", secret: "correct-password" }),
		}),
	);
});
