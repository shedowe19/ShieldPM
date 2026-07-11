import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	downloadPost: vi.fn(),
	invalidateQueries: vi.fn(),
	remove: vi.fn(),
	show: vi.fn(),
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
	createCertificate: vi.fn(),
}));

vi.mock("src/api/backend/base", () => ({
	downloadPost: mocks.downloadPost,
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children }: PropsWithChildren<{ open: boolean }>) => <div role="dialog">{children}</div>,
	DialogContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogFooter: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/select", () => ({
	Select: ({
		children,
		defaultValue,
		onValueChange,
	}: PropsWithChildren<{ defaultValue?: string; onValueChange?: (value: string) => void }>) => (
		<div>
			{defaultValue === "server" && (
				<button type="button" onClick={() => onValueChange?.("client")}>
					Choose client certificate
				</button>
			)}
			{children}
		</div>
	),
	SelectContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectItem: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectTrigger: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock("src/locale", () => ({
	intl: {
		formatMessage: ({ id }: { id: string }) => id,
	},
	T: ({ id }: { id: string }) => <>{id}</>,
}));

vi.mock("src/notifications", () => ({
	showObjectSuccess: vi.fn(),
}));

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("InternalCertificateModal", () => {
	beforeEach(() => {
		mocks.invalidateQueries.mockClear();
		mocks.remove.mockClear();
		mocks.show.mockClear();
		mocks.downloadPost.mockResolvedValue(undefined);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				blob: vi.fn().mockResolvedValue(new Blob(["client certificate"])),
				ok: true,
			}),
		);
		const TestURL = class extends URL {};
		Object.assign(TestURL, {
			createObjectURL: vi.fn(() => "blob:shieldpm-client-certificate"),
			revokeObjectURL: vi.fn(),
		});
		vi.stubGlobal("URL", TestURL);
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
	});

	it("uses the shared POST download client after saving a client certificate", async () => {
		const { showInternalCertificateModal } = await import("./InternalCertificateModal");
		showInternalCertificateModal();
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("Internal certificate modal was not registered");
		}

		render(<ModalComponent remove={mocks.remove} visible />);
		fireEvent.click(screen.getByRole("button", { name: "Choose client certificate" }));
		fireEvent.change(await screen.findByLabelText("certificates.internal.identity_name"), {
			target: { value: "operator-laptop" },
		});
		fireEvent.change(screen.getByLabelText("certificates.internal.password"), {
			target: { value: "test-password" },
		});
		fireEvent.click(screen.getByRole("button", { name: "save" }));

		await waitFor(() =>
			expect(mocks.downloadPost).toHaveBeenCalledWith(
				{
					data: {
						common_name: "operator-laptop",
						password: "test-password",
						years: 10,
					},
					url: "nginx/certificates/internal/client",
				},
				"operator-laptop.p12",
			),
		);

		expect(fetch).not.toHaveBeenCalled();
	});
});
