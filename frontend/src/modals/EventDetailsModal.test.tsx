import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, PropsWithChildren } from "react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	show: vi.fn(),
	toast: vi.fn(),
	useAuditLog: vi.fn(),
	useHealth: vi.fn(),
}));

vi.mock("@tabler/icons-react", () => ({
	IconCode: () => null,
	IconCopy: () => null,
	IconListDetails: () => null,
}));

vi.mock("ez-modal-react", () => ({
	default: {
		create: <T,>(Component: T) => Component,
		show: mocks.show,
	},
}));

vi.mock("src/components", () => ({
	EventFormatter: () => <div />,
	Loading: () => <div data-testid="loading" />,
	UserAvatar: () => <div />,
}));

vi.mock("src/components/LazyCodeEditor", () => ({
	LazyCodeEditor: ({ value }: { value: string }) => <output data-testid="metadata">{value}</output>,
}));

vi.mock("src/components/ui/alert", () => ({
	Alert: ({ children }: PropsWithChildren) => <div>{children}</div>,
	AlertDescription: ({ children }: PropsWithChildren) => <div>{children}</div>,
	AlertTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({ children, ...props }: PropsWithChildren<ComponentProps<"button">>) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children }: PropsWithChildren) => <div role="dialog">{children}</div>,
	DialogContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogFooter: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogTitle: ({ children }: PropsWithChildren) => <h1>{children}</h1>,
}));

vi.mock("src/hooks", () => ({
	useAuditLog: mocks.useAuditLog,
	useHealth: mocks.useHealth,
}));

vi.mock("src/hooks/use-toast", () => ({ toast: mocks.toast }));

const renderModal = async () => {
	const { showEventDetailsModal } = await import("./EventDetailsModal");
	showEventDetailsModal(73);
	const ModalComponent = mocks.show.mock.calls[0]?.[0];

	if (!ModalComponent) {
		throw new Error("Event details modal was not registered");
	}

	render(<ModalComponent id={73} remove={vi.fn()} visible />);
};

describe("EventDetailsModal", () => {
	beforeEach(async () => {
		mocks.show.mockClear();
		mocks.useAuditLog.mockReturnValue({ data: undefined, error: null, isLoading: false });
		mocks.useHealth.mockReturnValue({ data: { demo: false } });
		await changeLocale("de");
	});

	afterEach(async () => {
		cleanup();
		await changeLocale("en");
		vi.clearAllMocks();
	});

	it("shows localized fallback errors", async () => {
		mocks.useAuditLog.mockReturnValue({ data: undefined, error: { message: "" }, isLoading: false });

		await renderModal();

		expect(await screen.findByText("Fehler")).toBeInTheDocument();
		expect(await screen.findByText("Unbekannter Fehler")).toBeInTheDocument();
		expect(screen.queryByText("Error")).not.toBeInTheDocument();
		expect(screen.queryByText("Unknown error")).not.toBeInTheDocument();
	});

	it("localizes metadata labels and masked demo values", async () => {
		mocks.useAuditLog.mockReturnValue({
			data: {
				action: "updated",
				createdOn: "2026-07-12T00:00:00Z",
				id: 73,
				meta: { client_ip: "192.0.2.10" },
				modifiedOn: "2026-07-12T00:00:00Z",
				objectId: 11,
				objectType: "proxy-host",
				userId: 1,
			},
			error: null,
			isLoading: false,
		});
		mocks.useHealth.mockReturnValue({ data: { demo: true } });

		await renderModal();

		expect(screen.getByText("Metadaten")).toBeInTheDocument();
		expect(screen.getByTestId("metadata")).toHaveTextContent("Ausgeblendet (Demo)");
		expect(screen.queryByText("Metadata")).not.toBeInTheDocument();
		expect(screen.getByTestId("metadata")).not.toHaveTextContent("Hidden (Demo)");
	});

	it("copies demo-masked metadata instead of the original sensitive value", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
		mocks.useAuditLog.mockReturnValue({
			data: {
				action: "updated",
				createdOn: "2026-07-12T00:00:00Z",
				id: 73,
				meta: { client_ip: "192.0.2.10" },
				modifiedOn: "2026-07-12T00:00:00Z",
				objectId: 11,
				objectType: "proxy-host",
				userId: 1,
			},
			error: null,
			isLoading: false,
		});
		mocks.useHealth.mockReturnValue({ data: { demo: true } });

		await renderModal();

		fireEvent.click(screen.getByRole("button", { name: "Metadaten kopieren" }));

		expect(writeText).toHaveBeenCalledWith('{\n  "client_ip": "Ausgeblendet (Demo)"\n}');
		expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining("192.0.2.10"));
	});

	it("reports denied clipboard access without leaking the metadata", async () => {
		const writeText = vi.fn().mockRejectedValue(new Error("Clipboard access denied"));
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
		mocks.useAuditLog.mockReturnValue({
			data: {
				action: "updated",
				createdOn: "2026-07-12T00:00:00Z",
				id: 73,
				meta: { client_ip: "192.0.2.10" },
				modifiedOn: "2026-07-12T00:00:00Z",
				objectId: 11,
				objectType: "proxy-host",
				userId: 1,
			},
			error: null,
			isLoading: false,
		});
		mocks.useHealth.mockReturnValue({ data: { demo: true } });

		await renderModal();

		fireEvent.click(screen.getByRole("button", { name: "Metadaten kopieren" }));

		await waitFor(() => {
			expect(mocks.toast).toHaveBeenCalledWith({
				description: "Metadaten konnten nicht kopiert werden.",
				variant: "destructive",
			});
		});
		expect(writeText).toHaveBeenCalledWith('{\n  "client_ip": "Ausgeblendet (Demo)"\n}');
		expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining("192.0.2.10"));
	});
});
