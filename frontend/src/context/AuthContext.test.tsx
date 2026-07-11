import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
}));

vi.mock("rooks", () => ({ useIntervalWhen: vi.fn() }));

vi.mock("src/api/backend", () => ({
	getToken: mocks.getToken,
	loginAsUser: mocks.loginAsUser,
	refreshToken: mocks.refreshToken,
	restoreSession: mocks.restoreSession,
}));

vi.mock("src/api/backend/base", () => ({ post: mocks.post }));

vi.mock("src/modules/AuthStore", () => ({
	default: {
		add: mocks.authStoreAdd,
		clear: mocks.authStoreClear,
		set: mocks.authStoreSet,
	},
}));

import { AuthProvider, useAuthState } from "./AuthContext";

function AuthProbe() {
	const { authenticated, loading, login } = useAuthState();

	return (
		<>
			<div data-testid="authentication-state">{loading ? "loading" : `ready:${authenticated}`}</div>
			<button type="button" onClick={() => void login("admin@example.test", "correct horse battery staple")}>
				Sign in
			</button>
		</>
	);
}

function renderAuthProvider() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

	render(
		<QueryClientProvider client={queryClient}>
			<AuthProvider>
				<AuthProbe />
			</AuthProvider>
		</QueryClientProvider>,
	);

	return queryClient;
}

describe("AuthProvider", () => {
	beforeEach(() => {
		vi.clearAllMocks();
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
});
