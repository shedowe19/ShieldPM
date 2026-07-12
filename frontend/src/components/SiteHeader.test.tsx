import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./SiteHeader";

const mocks = vi.hoisted(() => ({
	logout: vi.fn(),
	showAccountChangePasswordModal: vi.fn(),
	showAccountUserModal: vi.fn(),
	useUser: vi.fn(),
}));

vi.mock("src/components/LocalePicker", () => ({ LocalePicker: () => null }));
vi.mock("src/components/ThemeSwitcher", () => ({ ThemeSwitcher: () => null }));

vi.mock("src/components/ui/avatar", () => ({
	Avatar: ({ children }: PropsWithChildren) => <div>{children}</div>,
	AvatarFallback: ({ children }: PropsWithChildren) => <span>{children}</span>,
	AvatarImage: ({ alt, src }: { alt?: string; src?: string }) => <img alt={alt} src={src} />,
}));

vi.mock("src/components/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DropdownMenuContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DropdownMenuItem: ({ children, onClick }: PropsWithChildren<{ onClick?: () => void }>) => (
		<button type="button" onClick={onClick}>
			{children}
		</button>
	),
	DropdownMenuLabel: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DropdownMenuSeparator: () => <hr />,
	DropdownMenuTrigger: ({ children }: PropsWithChildren) => <>{children}</>,
}));

vi.mock("src/context", () => ({
	useAuthState: () => ({ logout: mocks.logout }),
}));

vi.mock("src/hooks/useUser", () => ({
	useUser: mocks.useUser,
}));

vi.mock("src/modals/account-lazy", () => ({
	showChangePasswordModal: mocks.showAccountChangePasswordModal,
	showUserModal: mocks.showAccountUserModal,
}));

describe("SiteHeader", () => {
	beforeEach(async () => {
		mocks.useUser.mockReturnValue({
			data: { avatar: null, nickname: "operator", roles: ["admin"] },
		});
		await changeLocale("de");
	});

	afterEach(async () => {
		cleanup();
		vi.clearAllMocks();
		await changeLocale("en");
	});

	it("localizes the profile menu control for screen-reader users", () => {
		render(<SiteHeader />);

		expect(screen.getByRole("button", { name: "Benutzermenü umschalten" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Toggle user menu" })).not.toBeInTheDocument();
	});

	it("defers profile and password modal loading through the account-only loader", () => {
		render(<SiteHeader />);

		fireEvent.click(screen.getByRole("button", { name: "Profil bearbeiten" }));
		fireEvent.click(screen.getByRole("button", { name: "Passwort ändern" }));

		expect(mocks.showAccountUserModal).toHaveBeenCalledWith("me");
		expect(mocks.showAccountChangePasswordModal).toHaveBeenCalledWith("me");
	});
});
