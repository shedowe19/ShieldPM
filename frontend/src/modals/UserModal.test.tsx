import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	avatarType: "upload",
	health: vi.fn(),
	remove: vi.fn(),
	setUser: vi.fn(),
	show: vi.fn(),
	showObjectSuccess: vi.fn(),
	uploadUserAvatar: vi.fn(),
	useUser: vi.fn(),
}));

vi.mock("@tabler/icons-react", () => ({
	IconId: () => null,
	IconLock: () => null,
	IconMail: () => null,
	IconPhoto: () => null,
	IconPower: () => null,
	IconSettings: () => null,
	IconShield: () => null,
	IconUser: () => null,
}));

vi.mock("ez-modal-react", () => ({
	default: {
		create: <T,>(Component: T) => Component,
		show: mocks.show,
	},
}));

vi.mock("lucide-react", () => ({
	AlertCircle: () => null,
	Loader2: () => null,
}));

vi.mock("src/api/backend", () => ({ uploadUserAvatar: mocks.uploadUserAvatar }));

vi.mock("src/components", () => ({
	Loading: () => null,
	UserAvatar: ({ name }: { name: string }) => <span data-testid="avatar-name">{name}</span>,
}));

vi.mock("src/components/ui/alert", () => ({
	Alert: ({ children }: PropsWithChildren) => <div>{children}</div>,
	AlertDescription: ({ children }: PropsWithChildren) => <div>{children}</div>,
	AlertTitle: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		variant: _variant,
		...props
	}: PropsWithChildren<ComponentProps<"button"> & { variant?: string }>) => <button {...props}>{children}</button>,
}));

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: PropsWithChildren) => <div>{children}</div>,
	CardContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
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
	Label: ({ children, className, htmlFor }: PropsWithChildren<ComponentProps<"label">>) => {
		if (htmlFor) {
			return (
				<label className={className} htmlFor={htmlFor}>
					{children}
				</label>
			);
		}

		return <div className={className}>{children}</div>;
	},
}));

vi.mock("src/components/ui/switch", () => ({ Switch: () => null }));

vi.mock("src/components/ui/tabs", () => ({
	Tabs: ({ children }: PropsWithChildren) => <div>{children}</div>,
	TabsContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	TabsList: ({ children }: PropsWithChildren) => <div>{children}</div>,
	TabsTrigger: ({ children }: PropsWithChildren) => <button type="button">{children}</button>,
}));

vi.mock("src/components/ui/toggle-group", () => ({
	ToggleGroup: ({ children }: PropsWithChildren) => <div>{children}</div>,
	ToggleGroupItem: ({ children, ...props }: PropsWithChildren<ComponentProps<"button">>) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
}));

vi.mock("src/hooks", () => ({
	useHealth: mocks.health,
	useSetUser: () => ({ mutate: mocks.setUser }),
	useUser: mocks.useUser,
}));

vi.mock("src/hooks/useObjectUrl", () => ({ useObjectUrl: () => "blob:avatar-preview" }));

vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => <>{id}</>,
}));

vi.mock("src/modules/Validations", () => ({
	validateEmail: () => undefined,
	validateString: () => undefined,
}));

vi.mock("src/notifications", () => ({ showObjectSuccess: mocks.showObjectSuccess }));
vi.mock("src/pages/Profile/Security", () => ({ default: () => null }));

describe("UserModal", () => {
	afterEach(cleanup);

	beforeEach(() => {
		mocks.health.mockReturnValue({ data: { demo: false } });
		mocks.remove.mockClear();
		mocks.setUser.mockClear();
		mocks.show.mockClear();
		mocks.showObjectSuccess.mockClear();
		mocks.uploadUserAvatar.mockRejectedValue(new Error("Avatar upload failed"));
		mocks.avatarType = "upload";
		mocks.useUser.mockImplementation((id: number | "me" | "new") => ({
			data:
				id === "me"
					? { id: 1 }
					: {
							avatar_type: mocks.avatarType,
							avatar_value: "",
							email: "avatar@example.test",
							id: id === "new" ? 0 : 73,
							isDisabled: false,
							name: id === "new" ? "" : "Avatar User",
							nickname: "avatar-user",
							roles: [],
						},
			error: null,
			isLoading: false,
		}));
		mocks.setUser.mockImplementation(
			(_user: unknown, options: { onSuccess?: (user: { id: number }) => Promise<void> | void }) => {
				void options.onSuccess?.({ id: 73 });
			},
		);
	});

	it("renders localized profile navigation labels", async () => {
		const { showUserModal } = await import("./UserModal");
		showUserModal("me");
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("User modal was not registered");
		}

		render(<ModalComponent id="me" remove={mocks.remove} visible />);

		expect(screen.getByRole("button", { name: "user.avatar" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "user.security" })).toBeInTheDocument();
	});

	it("renders localized avatar picker and upload controls", async () => {
		const { showUserModal } = await import("./UserModal");
		showUserModal(73);
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("User modal was not registered");
		}

		render(<ModalComponent id={73} remove={mocks.remove} visible />);

		expect(screen.getByText("user.avatar.profile-preview")).toBeInTheDocument();
		expect(screen.getByText("user.avatar.source")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "user.avatar.gravatar" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "user.avatar.url" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "user.avatar.upload" })).toBeInTheDocument();
		expect(screen.getByLabelText("user.avatar.upload-image")).toBeInTheDocument();
		expect(screen.getByText("user.avatar.choose-file")).toBeInTheDocument();
		expect(screen.getByText("user.avatar.upload-requirements")).toBeInTheDocument();
	});

	it("keeps the avatar file input reachable for assistive technology", async () => {
		const { showUserModal } = await import("./UserModal");
		showUserModal(73);
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("User modal was not registered");
		}

		render(<ModalComponent id={73} remove={mocks.remove} visible />);

		const fileInput = screen.getByLabelText("user.avatar.upload-image");
		expect(fileInput).toHaveClass("sr-only");
		expect(fileInput).not.toHaveClass("hidden");
	});

	it("renders the localized Gravatar description", async () => {
		mocks.avatarType = "gravatar";
		const { showUserModal } = await import("./UserModal");
		showUserModal(73);
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("User modal was not registered");
		}

		render(<ModalComponent id={73} remove={mocks.remove} visible />);

		expect(screen.getByText("user.avatar.gravatar-description")).toBeInTheDocument();
	});

	it("renders localized custom avatar URL controls", async () => {
		mocks.avatarType = "url";
		const { showUserModal } = await import("./UserModal");
		showUserModal(73);
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("User modal was not registered");
		}

		render(<ModalComponent id={73} remove={mocks.remove} visible />);

		expect(screen.getByLabelText("user.avatar.image-url")).toBeInTheDocument();
		expect(screen.getByPlaceholderText("user.avatar.image-url-placeholder")).toBeInTheDocument();
		expect(screen.getByText("user.avatar.image-url-help")).toBeInTheDocument();
	});

	it("uses localized error titles and fallback messages", async () => {
		mocks.useUser.mockImplementation((id: number | "me") => ({
			data: id === "me" ? { id: 1 } : undefined,
			error: id === "me" ? null : new Error(),
			isLoading: false,
		}));
		const { showUserModal } = await import("./UserModal");
		showUserModal(73);
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("User modal was not registered");
		}

		render(<ModalComponent id={73} remove={mocks.remove} visible />);

		expect(screen.getByText("error.title")).toBeInTheDocument();
		expect(screen.getByText("error.unknown")).toBeInTheDocument();
	});

	it("reports a localized fallback when saving a user fails without an Error object", async () => {
		mocks.setUser.mockImplementation((_user: unknown, options: { onError?: (error: unknown) => void }) =>
			options.onError?.("Save failed"),
		);
		const { showUserModal } = await import("./UserModal");
		showUserModal(73);
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("User modal was not registered");
		}

		render(<ModalComponent id={73} remove={mocks.remove} visible />);
		fireEvent.click(screen.getByRole("button", { name: "save" }));

		expect(await screen.findByText("error.unknown")).toBeInTheDocument();
		expect(mocks.remove).not.toHaveBeenCalled();
	});

	it("uses the localized user label for a blank avatar name", async () => {
		const { showUserModal } = await import("./UserModal");
		showUserModal("new");
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("User modal was not registered");
		}

		render(<ModalComponent id="new" remove={mocks.remove} visible />);

		expect(screen.getByTestId("avatar-name")).toHaveTextContent("user");
	});

	it("renders the demo restriction through localized messages", async () => {
		mocks.health.mockReturnValue({ data: { demo: true } });
		const { showUserModal } = await import("./UserModal");
		showUserModal(73);
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("User modal was not registered");
		}

		render(<ModalComponent id={73} remove={mocks.remove} visible />);

		expect(screen.getByText("users.demo.access-denied")).toBeInTheDocument();
		expect(screen.getByText("users.demo.disabled")).toBeInTheDocument();
	});

	it("keeps the form open and reports an avatar upload failure after saving the user", async () => {
		const { showUserModal } = await import("./UserModal");
		showUserModal(73);
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("User modal was not registered");
		}

		render(<ModalComponent remove={mocks.remove} visible />);
		fireEvent.change(screen.getByLabelText("user.avatar.upload-image"), {
			target: { files: [new File(["avatar"], "avatar.png", { type: "image/png" })] },
		});
		fireEvent.click(screen.getByRole("button", { name: "save" }));

		await waitFor(() => expect(mocks.uploadUserAvatar).toHaveBeenCalledOnce());

		expect(await screen.findByText("Avatar upload failed")).toBeInTheDocument();
		expect(mocks.remove).not.toHaveBeenCalled();
		expect(mocks.showObjectSuccess).not.toHaveBeenCalled();
	});
});
