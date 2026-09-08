import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getToken: vi.fn(),
	loginAsUser: vi.fn(),
	post: vi.fn(),
	refreshToken: vi.fn(),
	restoreSession: vi.fn(),
	authStoreAdd: vi.fn(),
	authStoreClear: vi.fn(),
	authStoreSet: vi.fn(),
	authStoreActive: true,
	useIntervalWhen: vi.fn(),
}));

vi.mock("rooks", () => ({ useIntervalWhen: mocks.useIntervalWhen }));

vi.mock("src/api/backend", () => ({
	getToken: mocks.getToken,
	loginAsUser: mocks.loginAsUser,
	refreshToken: mocks.refreshToken,
	restoreSession: mocks.restoreSession,
}));

vi.mock("src/api/backend/base", () => ({ post: mocks.post }));

vi.mock("src/modules/AuthStore", () => ({
	AUTHENTICATION_EXPIRED_EVENT: "shieldpm:authentication-expired",
	default: {
		add: mocks.authStoreAdd,
		clear: mocks.authStoreClear,
		set: mocks.authStoreSet,
		get active() {
			return mocks.authStoreActive;
		},
	},
}));

import { AuthProvider, useAuthState } from "./AuthContext";

let nextSessionProbeInstance = 0;

function AuthProbe() {
	const { authenticated, loading, completeLogin, login, loginAs, logout } = useAuthState();

	return (
		<>
			<div data-testid="authentication-state">{loading ? "loading" : `ready:${authenticated}`}</div>
			<button type="button" onClick={() => completeLogin({ expires: Date.now() + 900_000 })}>
				Complete Duo login
			</button>
			<button type="button" onClick={() => void login("admin@example.test", "correct horse battery staple")}>
				Sign in
			</button>
			<button type="button" onClick={() => void loginAs(2)}>
				Impersonate user
			</button>
			<button type="button" onClick={() => void logout()}>
				Return to administrator
			</button>
		</>
	);
}

function SessionProbe() {
	const [instance] = useState(() => ++nextSessionProbeInstance);

	return <div data-testid="session-instance">{instance}</div>;
}

function renderAuthProvider() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

	render(
		<QueryClientProvider client={queryClient}>
			<AuthProvider>
				<AuthProbe />
				<SessionProbe />
			</AuthProvider>
		</QueryClientProvider>,
	);

	return queryClient;
}

describe("AuthProvider", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		window.history.replaceState({}, "", "/");
		nextSessionProbeInstance = 0;
		mocks.authStoreActive = true;
		mocks.refreshToken.mockRejectedValue(new Error("No existing session"));
	});

	afterEach(() => {
		cleanup();
		window.history.replaceState({}, "", "/");
	});

	it("restores an existing session on ordinary pages", async () => {
		const token = { expires: Date.now() + 900_000 };
		mocks.refreshToken.mockResolvedValue(token);
		renderAuthProvider();

		await waitFor(() => expect(screen.getByTestId("authentication-state")).toHaveTextContent("ready:true"));
		expect(mocks.refreshToken).toHaveBeenCalledOnce();
		expect(mocks.authStoreSet).toHaveBeenCalledWith(token);
	});

	it.each(["/duo-callback", "/duo-callback/", "/Duo-Callback"])(
		"waits for Duo completion without starting a competing session refresh at %s",
		async (pathname) => {
			window.history.replaceState({}, "", `${pathname}?duo_code=code&state=state`);
			renderAuthProvider();

			expect(screen.getByTestId("authentication-state")).toHaveTextContent("ready:false");
			expect(mocks.refreshToken).not.toHaveBeenCalled();
			expect(mocks.useIntervalWhen.mock.lastCall?.[2]).toBe(false);
			await act(async () => {
				await mocks.useIntervalWhen.mock.lastCall?.[0]();
			});
			expect(mocks.refreshToken).not.toHaveBeenCalled();

			fireEvent.click(screen.getByRole("button", { name: "Complete Duo login" }));

			expect(screen.getByTestId("authentication-state")).toHaveTextContent("ready:true");
			expect(mocks.useIntervalWhen.mock.lastCall?.[2]).toBe(true);
			expect(mocks.refreshToken).not.toHaveBeenCalled();
		},
	);

	it("clears cached user data before accepting a direct login token", async () => {
		const token = { expires: Date.now() + 60 * 60 * 1000, user: { id: 1 } };
		mocks.getToken.mockResolvedValue(token);
		const queryClient = renderAuthProvider();

		await waitFor(() => expect(screen.getByTestId("authentication-state")).toHaveTextContent("ready:false"));
		queryClient.setQueryData(["profile"], { email: "previous-user@example.test" });

		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

		await waitFor(() => expect(screen.getByTestId("authentication-state")).toHaveTextContent("ready:true"));
		expect(mocks.authStoreSet).toHaveBeenCalledWith(token);
		expect(queryClient.getQueryData(["profile"])).toBeUndefined();
	});

	it("switches to the login state after the API signals that authentication expired", async () => {
		const token = { expires: Date.now() + 60 * 60 * 1000, user: { id: 1 } };
		mocks.refreshToken.mockResolvedValue(token);
		renderAuthProvider();

		await waitFor(() => expect(screen.getByTestId("authentication-state")).toHaveTextContent("ready:true"));

		window.dispatchEvent(new Event("shieldpm:authentication-expired"));

		await waitFor(() => expect(screen.getByTestId("authentication-state")).toHaveTextContent("ready:false"));
	});

	it("leaves the authenticated screen when a silent periodic refresh expires the session", async () => {
		mocks.refreshToken.mockResolvedValueOnce({ expires: Date.now() + 900_000 });
		renderAuthProvider();
		await waitFor(() => expect(screen.getByTestId("authentication-state")).toHaveTextContent("ready:true"));

		mocks.authStoreActive = false;
		mocks.refreshToken.mockRejectedValueOnce(new Error("Unauthorized"));
		await act(async () => {
			await mocks.useIntervalWhen.mock.lastCall?.[0]();
		});

		expect(screen.getByTestId("authentication-state")).toHaveTextContent("ready:false");
	});

	it("handles a temporary periodic refresh failure without logging out", async () => {
		mocks.refreshToken.mockResolvedValueOnce({ expires: Date.now() + 900_000 });
		renderAuthProvider();
		await waitFor(() => expect(screen.getByTestId("authentication-state")).toHaveTextContent("ready:true"));

		mocks.refreshToken.mockRejectedValueOnce(new Error("Offline"));
		await act(async () => {
			await mocks.useIntervalWhen.mock.lastCall?.[0]();
		});

		expect(screen.getByTestId("authentication-state")).toHaveTextContent("ready:true");
	});

	it("does not restore a session from a refresh that finishes after logout", async () => {
		const token = { expires: Date.now() + 900_000 };
		mocks.refreshToken.mockResolvedValueOnce(token);
		mocks.restoreSession.mockRejectedValueOnce(new Error("No backup session"));
		mocks.post.mockResolvedValueOnce(undefined);
		renderAuthProvider();
		await waitFor(() => expect(screen.getByTestId("authentication-state")).toHaveTextContent("ready:true"));

		let finishRefresh: (response: typeof token) => void = () => {};
		mocks.refreshToken.mockReturnValueOnce(
			new Promise((resolve) => {
				finishRefresh = resolve;
			}),
		);
		const pendingRefresh = mocks.useIntervalWhen.mock.lastCall?.[0]();
		fireEvent.click(screen.getByRole("button", { name: "Return to administrator" }));
		await waitFor(() => expect(screen.getByTestId("authentication-state")).toHaveTextContent("ready:false"));

		await act(async () => {
			finishRefresh(token);
			await pendingRefresh;
		});

		expect(screen.getByTestId("authentication-state")).toHaveTextContent("ready:false");
		expect(mocks.authStoreSet).toHaveBeenCalledOnce();
	});

	it("remounts session-dependent UI after impersonating without a document reload", async () => {
		const adminToken = { expires: Date.now() + 60 * 60 * 1000, user: { id: 1 } };
		const impersonatedToken = { expires: Date.now() + 60 * 60 * 1000, user: { id: 2 } };
		mocks.refreshToken.mockResolvedValue(adminToken);
		mocks.loginAsUser.mockResolvedValue(impersonatedToken);
		const queryClient = renderAuthProvider();
		const originalLocation = window.location;
		const reload = vi.fn();
		Object.defineProperty(window, "location", { writable: true, value: { reload } });

		try {
			await waitFor(() => expect(screen.getByTestId("authentication-state")).toHaveTextContent("ready:true"));
			queryClient.setQueryData(["profile"], { email: "admin@example.test" });

			fireEvent.click(screen.getByRole("button", { name: "Impersonate user" }));

			await waitFor(() => expect(screen.getByTestId("session-instance")).toHaveTextContent("2"));
			expect(screen.getByTestId("authentication-state")).toHaveTextContent("ready:true");
			expect(mocks.authStoreAdd).toHaveBeenCalledWith(impersonatedToken, true);
			expect(queryClient.getQueryData(["profile"])).toBeUndefined();
			expect(reload).not.toHaveBeenCalled();
		} finally {
			Object.defineProperty(window, "location", { value: originalLocation });
		}
	});

	it("remounts session-dependent UI after restoring an administrator session without a document reload", async () => {
		const impersonatedToken = { expires: Date.now() + 60 * 60 * 1000, user: { id: 2 } };
		const adminToken = { expires: Date.now() + 60 * 60 * 1000, user: { id: 1 } };
		mocks.refreshToken.mockResolvedValue(impersonatedToken);
		mocks.restoreSession.mockResolvedValue(adminToken);
		const queryClient = renderAuthProvider();
		const originalLocation = window.location;
		const reload = vi.fn();
		Object.defineProperty(window, "location", { writable: true, value: { reload } });

		try {
			await waitFor(() => expect(screen.getByTestId("authentication-state")).toHaveTextContent("ready:true"));
			queryClient.setQueryData(["profile"], { email: "impersonated@example.test" });

			fireEvent.click(screen.getByRole("button", { name: "Return to administrator" }));

			await waitFor(() => expect(screen.getByTestId("session-instance")).toHaveTextContent("2"));
			expect(screen.getByTestId("authentication-state")).toHaveTextContent("ready:true");
			expect(mocks.authStoreAdd).toHaveBeenCalledWith(adminToken);
			expect(queryClient.getQueryData(["profile"])).toBeUndefined();
			expect(reload).not.toHaveBeenCalled();
		} finally {
			Object.defineProperty(window, "location", { value: originalLocation });
		}
	});
});
