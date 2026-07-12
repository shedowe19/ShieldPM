import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	authenticated: false,
	failAnalyticsImport: false,
	failDashboard: false,
	renderDashboard: vi.fn(),
}));

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
	useAuthState: () => ({ authenticated: mocks.authenticated }),
}));
vi.mock("src/hooks/useHealth", () => ({
	useHealth: () => ({
		data: { setup: true, status: "OK" },
		isError: false,
		isLoading: false,
	}),
}));
vi.mock("src/pages/DuoCallback", () => ({
	default: () => <div>Duo callback</div>,
}));
vi.mock("src/pages/Dashboard", () => ({
	default: () => mocks.renderDashboard(),
}));
vi.mock("src/pages/Analytics", () => {
	if (mocks.failAnalyticsImport) {
		throw new Error("Analytics chunk failed");
	}
	return { default: () => <div>Analytics</div> };
});
vi.mock("src/pages/Login", () => ({ default: () => <div>Login</div> }));

afterEach(async () => {
	cleanup();
	vi.restoreAllMocks();
	await changeLocale("en");
	window.history.replaceState({}, "", "/");
});

describe("Router", () => {
	beforeEach(() => {
		mocks.authenticated = false;
		mocks.failAnalyticsImport = false;
		mocks.failDashboard = false;
		mocks.renderDashboard.mockImplementation(() => {
			if (mocks.failDashboard) {
				throw new Error("Dashboard chunk failed");
			}
			return <div>Dashboard</div>;
		});
		window.history.replaceState({}, "", "/duo-callback?duo_code=duo-code");
	});

	it("renders the public Duo callback before authentication", async () => {
		const { default: Router } = await import("./Router");

		render(<Router />);

		expect(await screen.findByText("Duo callback")).toBeInTheDocument();
		expect(screen.queryByText("Login")).not.toBeInTheDocument();
	});

	it("shows a localized reload action when an authenticated route render fails", async () => {
		mocks.authenticated = true;
		mocks.failDashboard = true;
		window.history.replaceState({}, "", "/");
		await changeLocale("de");
		vi.spyOn(console, "error").mockImplementation(() => {});
		const reloadSpy = vi.spyOn(window.location, "reload").mockImplementation(() => {});
		const { default: Router } = await import("./Router");

		render(<Router />);

		expect(await screen.findByRole("alert")).toHaveTextContent("Diese Seite konnte nicht geladen werden.");
		fireEvent.click(screen.getByRole("button", { name: "Seite neu laden" }));
		expect(reloadSpy).toHaveBeenCalledOnce();
	});

	it("shows a localized reload action when a lazy route chunk fails", async () => {
		mocks.authenticated = true;
		mocks.failAnalyticsImport = true;
		window.history.replaceState({}, "", "/analytics");
		await changeLocale("de");
		vi.spyOn(console, "error").mockImplementation(() => {});
		const reloadSpy = vi.spyOn(window.location, "reload").mockImplementation(() => {});
		const { default: Router } = await import("./Router");

		render(<Router />);

		expect(await screen.findByRole("alert")).toHaveTextContent("Diese Seite konnte nicht geladen werden.");
		fireEvent.click(screen.getByRole("button", { name: "Seite neu laden" }));
		expect(reloadSpy).toHaveBeenCalledOnce();
	});
});
