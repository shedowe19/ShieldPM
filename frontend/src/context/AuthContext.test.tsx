import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { getToken } from "src/api/backend";
import { get } from "src/api/backend/base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuthState } from "./AuthContext";

const { mockAuthStore, mockGetToken, mockRefreshToken } = vi.hoisted(() => ({
	mockGetToken: vi.fn(),
	mockRefreshToken: vi.fn(),
	mockAuthStore: {
		add: vi.fn(),
		clear: vi.fn(),
		csrfToken: "csrf-token",
		set: vi.fn(),
		setCsrfToken: vi.fn(),
	},
}));

vi.mock("src/api/backend", async () => {
	const actual = await vi.importActual<typeof import("src/api/backend")>("src/api/backend");
	return {
		...actual,
		getToken: mockGetToken,
		loginAsUser: vi.fn(),
		refreshToken: () => mockRefreshToken(),
		restoreSession: vi.fn(),
	};
});

vi.mock("src/modules/AuthStore", () => ({
	default: mockAuthStore,
}));

function AuthStateProbe() {
	const { authenticated, loading, login } = useAuthState();
	return (
		<div>
			<span>authenticated:{String(authenticated)}</span>
			<span>loading:{String(loading)}</span>
			<button type="button" onClick={() => login("second@example.com", "password")}>
				Login
			</button>
		</div>
	);
}

function renderAuthProvider() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	});

	render(
		<QueryClientProvider client={queryClient}>
			<AuthProvider tokenRefreshInterval={60_000}>
				<AuthStateProbe />
			</AuthProvider>
		</QueryClientProvider>,
	);

	return queryClient;
}

describe("AuthProvider", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetToken.mockResolvedValue({ expires: 456 });
		mockRefreshToken.mockResolvedValue({ expires: 123 });
	});

	afterEach(() => {
		cleanup();
		globalThis.fetch = originalFetch;
	});

	it("clears the authenticated state when a silent refresh request receives 401", async () => {
		renderAuthProvider();

		await waitFor(() => {
			expect(screen.getByText("authenticated:true")).toBeInTheDocument();
		});

		globalThis.fetch = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ error: { message: "Unauthorized" } }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			}),
		);

		await expect(get({ url: "/tokens/refresh", silentAuth: true })).rejects.toThrow("Unauthorized");

		await waitFor(() => {
			expect(screen.getByText("authenticated:false")).toBeInTheDocument();
		});
		expect(mockAuthStore.clear).toHaveBeenCalled();
	});

	it("clears the query cache before accepting a direct login", async () => {
		const queryClient = renderAuthProvider();
		queryClient.setQueryData(["current-user"], { id: 1, name: "Previous User" });

		await waitFor(() => {
			expect(screen.getByText("authenticated:true")).toBeInTheDocument();
		});

		screen.getByRole("button", { name: "Login" }).click();

		await waitFor(() => {
			expect(getToken).toHaveBeenCalledWith("second@example.com", "password");
		});
		expect(queryClient.getQueryData(["current-user"])).toBeUndefined();
	});
});
