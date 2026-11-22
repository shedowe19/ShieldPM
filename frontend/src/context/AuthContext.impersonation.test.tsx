import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getToken: vi.fn(),
	loginAsUser: vi.fn(),
	post: vi.fn(),
	refreshToken: vi.fn(),
	restoreSession: vi.fn(),
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

import AuthStore, { AUTHENTICATION_EXPIRED_EVENT } from "src/modules/AuthStore";
import { AuthProvider, useAuthState } from "./AuthContext";

const admin = { expires: Date.now() + 900_000, user: { id: 1 } };
const target = { expires: Date.now() + 900_000, user: { id: 2 } };
const queryClients = new Set<QueryClient>();

function Probe() {
	const { authenticated, impersonating, loading, loginAs, logout, restoreAdminSession } = useAuthState();
	return (
		<>
			<output>{loading ? "loading" : authenticated ? "signed in" : "signed out"}</output>
			<output>{impersonating ? "acting as target" : "own identity"}</output>
			<button type="button" onClick={() => void loginAs(2)}>
				Impersonate
			</button>
			<button type="button" onClick={() => void logout()}>
				Sign out
			</button>
			<button type="button" onClick={() => void restoreAdminSession()}>
				Return to administrator
			</button>
		</>
	);
}

function renderProvider() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	queryClients.add(client);
	return render(
		<QueryClientProvider client={client}>
			<AuthProvider>
				<Probe />
			</AuthProvider>
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	vi.resetAllMocks();
	AuthStore.clear();
	mocks.refreshToken.mockResolvedValue(admin);
	mocks.loginAsUser.mockResolvedValue(target);
	mocks.restoreSession.mockResolvedValue(admin);
	mocks.post.mockResolvedValue(undefined);
});
afterEach(() => {
	cleanup();
	for (const client of queryClients) client.clear();
	queryClients.clear();
	AuthStore.clear();
});

describe("impersonated session exits", () => {
	it("signs the target out completely instead of silently restoring the administrator", async () => {
		renderProvider();
		await screen.findByText("signed in");
		fireEvent.click(screen.getByRole("button", { name: "Impersonate" }));
		await waitFor(() => expect(AuthStore.userId).toBe(2));
		expect(screen.getByText("acting as target")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(screen.getByText("signed out")).toBeInTheDocument());
		expect(mocks.restoreSession).not.toHaveBeenCalled();
		expect(mocks.post).toHaveBeenCalledWith({ url: "/tokens/logout", silentAuth: true });
		expect(AuthStore.active).toBe(false);
		expect(screen.getByText("own identity")).toBeInTheDocument();
	});

	it("restores the administrator only through the explicit restore action", async () => {
		renderProvider();
		await screen.findByText("signed in");
		fireEvent.click(screen.getByRole("button", { name: "Impersonate" }));
		await waitFor(() => expect(AuthStore.userId).toBe(2));

		fireEvent.click(screen.getByRole("button", { name: "Return to administrator" }));

		await waitFor(() => expect(AuthStore.userId).toBe(1));
		expect(mocks.restoreSession).toHaveBeenCalledOnce();
		expect(mocks.post).not.toHaveBeenCalled();
		expect(screen.getByText("own identity")).toBeInTheDocument();
		await act(async () => {
			await mocks.useIntervalWhen.mock.lastCall?.[0]();
		});
		expect(mocks.refreshToken).toHaveBeenCalledTimes(2);
	});

	it("preserves impersonation through a provider remount such as a locale change", async () => {
		const view = renderProvider();
		await screen.findByText("signed in");
		fireEvent.click(screen.getByRole("button", { name: "Impersonate" }));
		await waitFor(() => expect(AuthStore.userId).toBe(2));
		view.unmount();
		renderProvider();
		await screen.findByText("signed in");
		expect(mocks.refreshToken).toHaveBeenCalledOnce();
		expect(AuthStore.userId).toBe(2);
		expect(screen.getByText("acting as target")).toBeInTheDocument();
	});

	it("retains the existing expired-session fallback while impersonating", async () => {
		renderProvider();
		await screen.findByText("signed in");
		fireEvent.click(screen.getByRole("button", { name: "Impersonate" }));
		await waitFor(() => expect(AuthStore.userId).toBe(2));
		act(() => {
			AuthStore.clear();
			window.dispatchEvent(new Event(AUTHENTICATION_EXPIRED_EVENT));
		});
		expect(screen.getByText("signed out")).toBeInTheDocument();
	});
});
