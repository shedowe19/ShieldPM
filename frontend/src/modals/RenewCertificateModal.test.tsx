import { cleanup, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	remove: vi.fn(),
	renewCertificate: vi.fn(),
	show: vi.fn(),
	useCertificate: vi.fn(),
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
	renewCertificate: mocks.renewCertificate,
}));

vi.mock("src/components", () => ({
	Loading: () => <div data-testid="loading" />,
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children }: PropsWithChildren<{ open: boolean }>) => <div role="dialog">{children}</div>,
	DialogContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogFooter: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));

vi.mock("src/hooks", () => ({
	useCertificate: mocks.useCertificate,
}));

vi.mock("src/notifications", () => ({
	showObjectSuccess: vi.fn(),
}));

afterEach(async () => {
	cleanup();
	await changeLocale("en");
	vi.clearAllMocks();
});

describe("RenewCertificateModal", () => {
	beforeEach(async () => {
		mocks.renewCertificate.mockReturnValue(new Promise(() => undefined));
		mocks.useCertificate.mockReturnValue({ data: { id: 42 }, error: null, isLoading: false });
		await changeLocale("de");
	});

	it("shows the renewal status in the selected locale", async () => {
		const { showRenewCertificateModal } = await import("./RenewCertificateModal");
		showRenewCertificateModal(42);
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("Renew certificate modal was not registered");
		}

		render(<ModalComponent remove={mocks.remove} visible />);

		expect(await screen.findByText("Bitte warten …")).toBeInTheDocument();
		expect(screen.queryByText("Please wait…")).not.toBeInTheDocument();
	});

	it("shows a localized fallback when renewal rejects with a non-Error value", async () => {
		mocks.renewCertificate.mockRejectedValue("Request failed");
		const { showRenewCertificateModal } = await import("./RenewCertificateModal");
		showRenewCertificateModal(42);
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("Renew certificate modal was not registered");
		}

		render(<ModalComponent remove={mocks.remove} visible />);

		expect(await screen.findByText("Fehler")).toBeInTheDocument();
		expect(await screen.findByText("Unbekannter Fehler")).toBeInTheDocument();
		expect(screen.queryByText("Error")).not.toBeInTheDocument();
		expect(screen.queryByText("Unknown error")).not.toBeInTheDocument();
	});

	it("shows localized generic errors when loading a certificate fails without a server message", async () => {
		mocks.useCertificate.mockReturnValue({ data: undefined, error: { message: "" }, isLoading: false });
		const { showRenewCertificateModal } = await import("./RenewCertificateModal");
		showRenewCertificateModal(42);
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("Renew certificate modal was not registered");
		}

		render(<ModalComponent remove={mocks.remove} visible />);

		expect(await screen.findByText("Fehler")).toBeInTheDocument();
		expect(await screen.findByText("Unbekannter Fehler")).toBeInTheDocument();
		expect(screen.queryByText("Error")).not.toBeInTheDocument();
		expect(screen.queryByText("Unknown error")).not.toBeInTheDocument();
	});
});
