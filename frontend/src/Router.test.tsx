import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/components/AnimatedPage", () => ({
	AnimatedPage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("src/components/ErrorNotFound", () => ({
	ErrorNotFound: () => <div>Not found</div>,
}));
vi.mock("src/components/LoadingPage", () => ({
	LoadingPage: () => <div>Loading</div>,
}));
vi.mock("src/components/Page", () => ({
	Page: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("src/components/Sidebar", () => ({
	Sidebar: () => <div>Sidebar</div>,
}));
vi.mock("src/components/SiteContainer", () => ({
	SiteContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("src/components/SiteFooter", () => ({
	SiteFooter: () => <div>Footer</div>,
}));
vi.mock("src/components/SiteHeader", () => ({
	SiteHeader: () => <div>Header</div>,
}));
vi.mock("src/components/Unhealthy", () => ({
	Unhealthy: () => <div>Unhealthy</div>,
}));

vi.mock("src/context", () => ({
	useAuthState: () => ({ authenticated: false }),
}));
vi.mock("src/hooks", () => ({
	useHealth: () => ({
		data: { setup: true, status: "OK" },
		isError: false,
		isLoading: false,
	}),
}));
vi.mock("src/pages/DuoCallback", () => ({
	default: () => <div>Duo callback</div>,
}));
vi.mock("src/pages/Login", () => ({ default: () => <div>Login</div> }));

afterEach(() => {
	cleanup();
	window.history.replaceState({}, "", "/");
});

describe("Router", () => {
	beforeEach(() => {
		window.history.replaceState({}, "", "/duo-callback?duo_code=duo-code");
	});

	it("renders the public Duo callback before authentication", async () => {
		const { default: Router } = await import("./Router");

		render(<Router />);

		expect(await screen.findByText("Duo callback")).toBeInTheDocument();
		expect(screen.queryByText("Login")).not.toBeInTheDocument();
	});
});
