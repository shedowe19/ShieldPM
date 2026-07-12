import { cleanup, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	remove: vi.fn(),
	show: vi.fn(),
	useRedirectionHost: vi.fn(),
}));

vi.mock("ez-modal-react", () => ({
	default: {
		create: <T,>(Component: T) => Component,
		show: mocks.show,
	},
}));

vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("src/api/backend", () => ({
	createRedirectionHost: vi.fn(),
	updateRedirectionHost: vi.fn(),
}));

vi.mock("src/components", () => ({
	DomainNamesField: () => null,
	NoteWarning: () => null,
	SSLCertificateField: () => null,
	SSLOptionsFields: () => null,
}));

vi.mock("src/components/Form/NginxConfigField", () => ({ NginxConfigField: () => null }));

vi.mock("src/components/ui/alert", () => ({
	Alert: ({ children }: PropsWithChildren) => <div>{children}</div>,
	AlertDescription: ({ children }: PropsWithChildren) => <div data-testid="alert-description">{children}</div>,
	AlertTitle: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children }: PropsWithChildren<{ open: boolean }>) => <div role="dialog">{children}</div>,
	DialogContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogFooter: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));

vi.mock("src/hooks", () => ({ useRedirectionHost: mocks.useRedirectionHost }));

vi.mock("src/notifications", () => ({ showObjectSuccess: vi.fn() }));

afterEach(async () => {
	cleanup();
	await changeLocale("en");
	vi.clearAllMocks();
});

describe("RedirectionHostModal", () => {
	beforeEach(async () => {
		mocks.useRedirectionHost.mockReturnValue({ data: null, error: { message: "" }, isLoading: false });
		await changeLocale("de");
	});

	it("shows a localized fallback when loading a redirection host fails without a server message", async () => {
		const { showRedirectionHostModal } = await import("./RedirectionHostModal");
		showRedirectionHostModal(42);
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("Redirection host modal was not registered");
		}

		render(<ModalComponent id={42} remove={mocks.remove} visible />);

		expect(await screen.findByText("Umleitungs-Host bearbeiten")).toBeInTheDocument();
		expect(await screen.findByText("Fehler")).toBeInTheDocument();
		expect(await screen.findByText("Unbekannter Fehler")).toBeInTheDocument();
		expect(screen.queryByText("Error")).not.toBeInTheDocument();
		expect(screen.queryByText("Unknown error")).not.toBeInTheDocument();
	});

	it("keeps a non-empty server error message unchanged", async () => {
		mocks.useRedirectionHost.mockReturnValue({ data: null, error: { message: "error.title" }, isLoading: false });
		const { showRedirectionHostModal } = await import("./RedirectionHostModal");
		showRedirectionHostModal(42);
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("Redirection host modal was not registered");
		}

		render(<ModalComponent id={42} remove={mocks.remove} visible />);

		expect(await screen.findByText("error.title")).toBeInTheDocument();
		expect(screen.getByTestId("alert-description")).toHaveTextContent("error.title");
	});
});
