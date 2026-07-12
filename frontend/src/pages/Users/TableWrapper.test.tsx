import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { changeLocale } from "src/locale";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	useHealth: vi.fn(),
	useUsers: vi.fn(),
}));

vi.mock("src/api/backend", () => ({
	deleteUser: vi.fn(),
	toggleUser: vi.fn(),
}));

vi.mock("src/context", () => ({
	useAuthState: () => ({ loginAs: vi.fn() }),
}));

vi.mock("src/hooks/useHealth", () => ({
	useHealth: mocks.useHealth,
}));

vi.mock("src/hooks/useUser", () => ({
	useUser: () => ({ data: undefined }),
}));

vi.mock("src/hooks/useUsers", () => ({
	useUsers: mocks.useUsers,
}));

vi.mock("src/modals/account-lazy", () => ({
	showUserModal: vi.fn(),
}));

vi.mock("src/notifications", () => ({
	showError: vi.fn(),
	showObjectSuccess: vi.fn(),
}));

afterEach(async () => {
	cleanup();
	mocks.useHealth.mockReset();
	mocks.useUsers.mockReset();
	await changeLocale("en-US");
});

describe("Users TableWrapper", () => {
	it("loads with its route-specific modal loader", async () => {
		await expect(import("./TableWrapper")).resolves.toMatchObject({ default: expect.any(Function) });
	});

	it("renders the demo restriction state in the active locale", async () => {
		mocks.useHealth.mockReturnValue({ data: { demo: true } });
		mocks.useUsers.mockReturnValue({ data: [] });
		await changeLocale("de-DE");
		const { default: TableWrapper } = await import("./TableWrapper");

		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		render(
			<QueryClientProvider client={queryClient}>
				<TableWrapper />
			</QueryClientProvider>,
		);

		expect(screen.getByRole("heading", { name: "Zugriff verweigert" })).toBeInTheDocument();
		expect(screen.getByText("Die Benutzerverwaltung ist im Demo-Modus deaktiviert.")).toBeInTheDocument();
		expect(
			screen.getByText("Aus Sicherheitsgründen ist die Verwaltung von Benutzern nicht erlaubt."),
		).toBeInTheDocument();
	});

	it("renders the loading error title in the active locale", async () => {
		mocks.useHealth.mockReturnValue({ data: { demo: false } });
		mocks.useUsers.mockReturnValue({ error: new Error("Backend request failed"), isError: true });
		await changeLocale("de-DE");
		const { default: TableWrapper } = await import("./TableWrapper");
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

		render(
			<QueryClientProvider client={queryClient}>
				<TableWrapper />
			</QueryClientProvider>,
		);

		expect(screen.getByRole("heading", { name: "Fehler" })).toBeInTheDocument();
		expect(screen.getByText("Backend request failed")).toBeInTheDocument();
	});
});
