import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Router from "./Router";

const mockUseHealth = vi.fn();
const mockUseAuthState = vi.fn();

vi.mock("framer-motion", () => ({
	AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("src/hooks", () => ({
	useHealth: () => mockUseHealth(),
}));

vi.mock("src/context", () => ({
	useAuthState: () => mockUseAuthState(),
}));

vi.mock("src/components", () => ({
	AnimatedPage: ({ children }: { children: React.ReactNode }) => <div data-testid="animated-page">{children}</div>,
	ErrorNotFound: () => <div>Not Found</div>,
	LoadingPage: ({ noLogo }: { noLogo?: boolean }) => <div>{noLogo ? "Loading without logo" : "Loading"}</div>,
	Page: ({ children }: { children: React.ReactNode }) => <div data-testid="app-page">{children}</div>,
	Sidebar: () => <aside>Sidebar</aside>,
	SiteContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
	SiteFooter: () => <footer>Footer</footer>,
	SiteHeader: () => <header>Header</header>,
	Unhealthy: () => <div>Unhealthy</div>,
}));

vi.mock("src/pages/Login", () => ({
	default: () => <div>Login Page</div>,
}));

vi.mock("src/pages/Setup", () => ({
	default: () => <div>Setup Page</div>,
}));

vi.mock("src/pages/Dashboard", () => ({
	default: () => <div>Dashboard Page</div>,
}));

vi.mock("src/pages/DuoCallback", () => ({
	default: () => <div>Duo Callback Page</div>,
}));

const healthySetupResponse = {
	isLoading: false,
	isError: false,
	data: {
		setup: true,
		status: "OK",
		version: "4.3.2",
	},
};

describe("Router", () => {
	beforeEach(() => {
		mockUseHealth.mockReturnValue(healthySetupResponse);
		mockUseAuthState.mockReturnValue({ authenticated: false, loading: false });
		window.history.pushState({}, "", "/");
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("keeps the app on the loading page while auth restore is still running", async () => {
		mockUseAuthState.mockReturnValue({ authenticated: false, loading: true });

		render(<Router />);

		expect(screen.getByText("Loading")).toBeInTheDocument();
		await expect(screen.findByText("Login Page", undefined, { timeout: 100 })).rejects.toThrow();
	});

	it("renders the Duo callback route without requiring an authenticated session first", async () => {
		window.history.pushState({}, "", "/duo-callback?duo_code=abc&state=xyz");
		mockUseAuthState.mockReturnValue({ authenticated: false, loading: false });

		render(<Router />);

		await waitFor(() => {
			expect(screen.getByText("Duo Callback Page")).toBeInTheDocument();
		});
		expect(screen.queryByText("Login Page")).not.toBeInTheDocument();
	});

	it("redirects authenticated users away from the public login route", async () => {
		window.history.pushState({}, "", "/login");
		mockUseAuthState.mockReturnValue({ authenticated: true, loading: false });

		render(<Router />);

		await waitFor(() => {
			expect(screen.getByText("Dashboard Page")).toBeInTheDocument();
		});
		expect(screen.queryByText("Login Page")).not.toBeInTheDocument();
	});
});
