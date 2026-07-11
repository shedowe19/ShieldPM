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
vi.mock("lucide-react", () => ({ AlertCircle: () => null }));
vi.mock("src/api/backend", () => ({ updateAuth: vi.fn() }));

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

describe("SetPasswordModal", () => {
	beforeEach(async () => {
		mocks.remove.mockClear();
		mocks.show.mockClear();
		await changeLocale("de");
	});

	afterEach(async () => {
		cleanup();
		await changeLocale("en");
	});

	it("gives password visibility and generation controls localized accessible names", async () => {
		const { showSetPasswordModal } = await import("./SetPasswordModal");
		showSetPasswordModal(73);
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("Set password modal was not registered");
		}

		render(<ModalComponent id={73} remove={mocks.remove} visible />);

		const visibilityButton = screen.getByRole("button", { name: "Passwort anzeigen" });
		expect(visibilityButton).toHaveAttribute("aria-label", "Passwort anzeigen");
		expect(visibilityButton).toHaveAttribute("aria-pressed", "false");
		expect(visibilityButton).not.toHaveAttribute("tabindex", "-1");
		expect(screen.getByRole("button", { name: "Zufälliges Passwort generieren" })).toHaveAttribute(
			"aria-label",
			"Zufälliges Passwort generieren",
		);

		fireEvent.click(visibilityButton);

		expect(screen.getByRole("button", { name: "Passwort verstecken" })).toHaveAttribute("aria-pressed", "true");
		expect(screen.getByLabelText(/Neues Passw/)).toHaveAttribute("type", "text");
	});
});
