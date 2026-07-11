import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, PropsWithChildren } from "react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	remove: vi.fn(),
	show: vi.fn(),
}));

type ButtonProps = PropsWithChildren<ComponentProps<"button"> & { size?: string; variant?: string }>;

vi.mock("@tabler/icons-react", () => ({
	IconDice: () => null,
	IconEye: () => null,
	IconEyeOff: () => null,
	IconLock: () => null,
}));

vi.mock("ez-modal-react", () => ({
	default: {
		create: <T,>(Component: T) => Component,
		show: mocks.show,
	},
}));

vi.mock("generate-password-browser", () => ({ generate: vi.fn() }));
vi.mock("lucide-react", () => ({ AlertCircle: () => null, Loader2: () => null }));
vi.mock("src/api/backend", () => ({ updateAuth: vi.fn() }));
vi.mock("src/hooks", () => ({ useHealth: () => ({ data: {} }) }));

vi.mock("src/components/ui/alert", () => ({
	Alert: ({ children }: PropsWithChildren) => <div>{children}</div>,
	AlertDescription: ({ children }: PropsWithChildren) => <div>{children}</div>,
	AlertTitle: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({ children, size: _size, variant: _variant, ...props }: ButtonProps) => (
		<button {...props}>{children}</button>
	),
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children }: PropsWithChildren) => <div role="dialog">{children}</div>,
	DialogContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogFooter: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/input", () => ({ Input: (props: ComponentProps<"input">) => <input {...props} /> }));

vi.mock("src/components/ui/label", () => ({
	Label: ({ children, htmlFor, ...props }: PropsWithChildren<ComponentProps<"label">>) => (
		<label htmlFor={htmlFor} {...props}>
			{children}
		</label>
	),
}));

vi.mock("src/modules/Validations", () => ({ validateString: () => undefined }));

describe("ChangePasswordModal", () => {
	beforeEach(async () => {
		mocks.remove.mockClear();
		mocks.show.mockClear();
		await changeLocale("de");
	});

	afterEach(async () => {
		cleanup();
		await changeLocale("en");
	});

	it("gives all password controls localized accessible names and keyboard access", async () => {
		const { showChangePasswordModal } = await import("./ChangePasswordModal");
		showChangePasswordModal("me");
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("Change password modal was not registered");
		}

		render(<ModalComponent id="me" remove={mocks.remove} visible />);

		const visibilityButtons = screen.getAllByRole("button", { name: "Passwort anzeigen" });
		expect(visibilityButtons).toHaveLength(3);
		for (const button of visibilityButtons) {
			expect(button).toHaveAttribute("aria-label", "Passwort anzeigen");
			expect(button).toHaveAttribute("aria-pressed", "false");
			expect(button).not.toHaveAttribute("tabindex", "-1");
		}
		expect(screen.getByRole("button", { name: "Zufälliges Passwort generieren" })).toHaveAttribute(
			"aria-label",
			"Zufälliges Passwort generieren",
		);

		for (const button of visibilityButtons) {
			fireEvent.click(button);
		}

		expect(screen.getAllByRole("button", { name: "Passwort verstecken" })).toHaveLength(3);
		expect(screen.getByLabelText(/Aktuelles Passw/)).toHaveAttribute("type", "text");
		expect(screen.getByLabelText(/Neues Passw/)).toHaveAttribute("type", "text");
		expect(screen.getByLabelText(/Passwort wiederholen/)).toHaveAttribute("type", "text");
	});
});
