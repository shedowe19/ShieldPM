import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getToken: vi.fn(),
	loginAsUser: vi.fn(),
	post: vi.fn(),
	refreshToken: vi.fn(),
	restoreSession: vi.fn(),
	renderLogin: vi.fn(),
	showError: vi.fn(),
}));
vi.mock("rooks", () => ({ useIntervalWhen: vi.fn() }));
vi.mock("src/api/backend", () => ({
	getToken: mocks.getToken,
	loginAsUser: mocks.loginAsUser,
	refreshToken: mocks.refreshToken,
	restoreSession: mocks.restoreSession,
}));
vi.mock("src/api/backend/base", () => ({ post: mocks.post }));
vi.mock("src/notifications", () => ({ showError: mocks.showError }));
vi.mock("src/context", async () => import("./AuthContext"));
vi.mock("src/hooks/useHealth", () => ({
	useHealth: () => ({ data: { setup: true, status: "OK" }, isError: false, isLoading: false }),
}));
vi.mock("src/components/AnimatedPage", () => ({ AnimatedPage: ({ children }: { children: ReactNode }) => children }));
vi.mock("src/components/LoadingPage", () => ({ LoadingPage: () => <div>Session loading</div> }));
vi.mock("src/components/Page", () => ({ Page: ({ children }: { children: ReactNode }) => children }));
vi.mock("src/components/SiteContainer", () => ({ SiteContainer: ({ children }: { children: ReactNode }) => children }));
vi.mock("src/components/Sidebar", () => ({ Sidebar: () => null }));
vi.mock("src/components/SiteHeader", () => ({ SiteHeader: () => null }));
vi.mock("src/components/SiteFooter", () => ({ SiteFooter: () => null }));
vi.mock("src/pages/Dashboard", () => ({ default: () => <div>Dashboard</div> }));
vi.mock("src/pages/Login", () => ({ default: () => mocks.renderLogin() }));

import AuthStore, { AUTHENTICATION_EXPIRED_EVENT } from "src/modules/AuthStore";
import Router from "src/Router";
import { type AuthContextType, AuthProvider, useAuthState } from "./AuthContext";

let auth: AuthContextType;
function LogoutControl() {
	auth = useAuthState();
	return auth.authenticated && !auth.loading ? (
		<button type="button" onClick={() => void auth.logout()}>
			Log out
		</button>
	) : null;
}
function LoginControl() {
	const { login } = useAuthState();
	return (
		<button type="button" onClick={() => void login("next@example.test", "password")}>
			Sign in
		</button>
	);
}
function deferred() {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
async function mountProvider() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const view = render(
		<QueryClientProvider client={client}>
			<AuthProvider>
				<LogoutControl />
				<Router />
			</AuthProvider>
		</QueryClientProvider>,
	);
	await screen.findByText("Dashboard");
	client.setQueryData(["profile"], { id: 1 });
	return { client, view };
}

beforeEach(() => {
	vi.resetAllMocks();
	AuthStore.clear();
	window.history.replaceState({}, "", "/");
	mocks.refreshToken.mockResolvedValue({ expires: Date.now() + 900_000, user: { id: 1 } });
	mocks.restoreSession.mockRejectedValue(new Error("No backup session"));
	mocks.getToken.mockResolvedValue({ expires: Date.now() + 900_000, user: { id: 2 } });
	mocks.renderLogin.mockImplementation(() => <LoginControl />);
});
afterEach(() => {
	cleanup();
	AuthStore.clear();
});

it.each(["success", "failure"] as const)(
	"keeps Login unmounted until the full logout cookie request settles (%s)",
	async (outcome) => {
		const pending = deferred();
		mocks.post.mockReturnValue(pending.promise);
		const { client } = await mountProvider();

		fireEvent.click(screen.getByRole("button", { name: "Log out" }));
		await screen.findByText("Session loading");
		expect(mocks.post).toHaveBeenCalledWith({ url: "/tokens/logout", silentAuth: true });
		expect(AuthStore.active).toBe(false);
		expect(client.getQueryData(["profile"])).toBeUndefined();
		expect(mocks.renderLogin).not.toHaveBeenCalled();
		expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
		expect(mocks.getToken).not.toHaveBeenCalled();

		await act(async () => {
			if (outcome === "success") pending.resolve();
			else pending.reject(new Error("Logout connection failed"));
		});
		expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
		expect(auth.loading).toBe(false);
		expect(auth.authenticated).toBe(false);
		if (outcome === "failure") expect(mocks.showError).toHaveBeenCalledWith("Logout connection failed");
		else expect(mocks.showError).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
		await screen.findByText("Dashboard");
		expect(AuthStore.userId).toBe(2);
	},
);

it("does not publish a logout failure after its provider unmounts", async () => {
	const pending = deferred();
	mocks.post.mockReturnValue(pending.promise);
	const { view } = await mountProvider();
	fireEvent.click(screen.getByRole("button", { name: "Log out" }));
	await screen.findByText("Session loading");
	view.unmount();
	await act(async () => pending.reject(new Error("Old logout failure")));
	expect(mocks.showError).not.toHaveBeenCalled();
});

it.each(["success", "failure"] as const)(
	"releases the logout gate after an intervening expiration event (%s)",
	async (outcome) => {
		const pending = deferred();
		mocks.post.mockReturnValue(pending.promise);
		await mountProvider();
		fireEvent.click(screen.getByRole("button", { name: "Log out" }));
		await screen.findByText("Session loading");
		act(() => window.dispatchEvent(new Event(AUTHENTICATION_EXPIRED_EVENT)));
		expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();

		await act(async () => {
			if (outcome === "success") pending.resolve();
			else pending.reject(new Error("Logout connection failed"));
		});
		expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
		expect(auth.loading).toBe(false);
		if (outcome === "failure") expect(mocks.showError).toHaveBeenCalledWith("Logout connection failed");
	},
);
