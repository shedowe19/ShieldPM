import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	ApiError: class ApiError extends Error {
		status: number;
		constructor(message: string, status: number) {
			super(message);
			this.status = status;
		}
	},
	getToken: vi.fn(),
	loginAsUser: vi.fn(),
	post: vi.fn(),
	refreshToken: vi.fn(),
	restoreSession: vi.fn(),
	authStoreAdd: vi.fn(),
	authStoreClear: vi.fn(),
	authStoreSet: vi.fn(),
}));

vi.mock("rooks", () => ({ useIntervalWhen: vi.fn() }));

vi.mock("src/api/backend", () => ({
	getToken: mocks.getToken,
	loginAsUser: mocks.loginAsUser,
	refreshToken: mocks.refreshToken,
	restoreSession: mocks.restoreSession,
}));

vi.mock("src/api/backend/base", () => ({ ApiError: mocks.ApiError, post: mocks.post }));

vi.mock("src/modules/AuthStore", () => ({
	AUTHENTICATION_EXPIRED_EVENT: "shieldpm:authentication-expired",
	default: {
		add: mocks.authStoreAdd,
		clear: mocks.authStoreClear,
		set: mocks.authStoreSet,
	},
}));

import { AuthProvider, useAuthState } from "./AuthContext";

let nextSessionProbeInstance = 0;

function AuthProbe() {
	const { authenticated, loading, login, loginAs, logout } = useAuthState();

	return (
		<>
			<div data-testid="authentication-state">{loading ? "loading" : `ready:${authenticated}`}</div>
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
		mocks.authStoreSet.mockReturnValue(true);
		nextSessionProbeInstance = 0;
		mocks.refreshToken.mockRejectedValue(new Error("No existing session"));
	});

	afterEach(() => {
		cleanup();
	});

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
			expect(mocks.authStoreAdd).toHaveBeenCalledWith(impersonatedToken);
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
