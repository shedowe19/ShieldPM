import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps, PropsWithChildren } from "react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	remove: vi.fn(),
	show: vi.fn(),
	useAccessList: vi.fn(),
}));

vi.mock("@tabler/icons-react", () => ({ IconShieldLock: () => null }));

vi.mock("ez-modal-react", () => ({
	default: {
		create: <T,>(Component: T) => Component,
		show: mocks.show,
	},
}));

vi.mock("lucide-react", () => ({
	AlertCircle: () => null,
	AlertTriangle: () => null,
	Loader2: () => null,
}));

vi.mock("src/components", () => ({
	AccessClientFields: () => null,
	BasicAuthFields: () => null,
	Loading: () => null,
}));

vi.mock("src/components/ui/alert", () => ({
	Alert: ({ children }: PropsWithChildren) => <div>{children}</div>,
	AlertDescription: ({ children }: PropsWithChildren) => <div>{children}</div>,
	AlertTitle: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({ children, ...props }: PropsWithChildren<ComponentProps<"button">>) => (
		<button {...props}>{children}</button>
	),
}));

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: PropsWithChildren) => <div>{children}</div>,
	CardContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogFooter: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogTitle: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("src/components/ui/input", () => ({ Input: (props: ComponentProps<"input">) => <input {...props} /> }));

vi.mock("src/components/ui/label", () => ({
	Label: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("src/components/ui/select", () => ({
	Select: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectItem: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectTrigger: ({ children }: PropsWithChildren) => <div>{children}</div>,
	SelectValue: () => null,
}));

vi.mock("src/components/ui/switch", () => ({ Switch: () => null }));

vi.mock("src/components/ui/tabs", () => ({
	Tabs: ({ children }: PropsWithChildren) => <div>{children}</div>,
	TabsContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	TabsList: ({ children }: PropsWithChildren) => <div>{children}</div>,
	TabsTrigger: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("src/components/ui/textarea", () => ({
	Textarea: (props: ComponentProps<"textarea">) => <textarea {...props} />,
}));

vi.mock("src/hooks", () => ({
	useAccessList: mocks.useAccessList,
	useSetAccessList: () => ({ mutate: vi.fn() }),
}));

vi.mock("src/modules/Validations", () => ({ validateString: vi.fn() }));
vi.mock("src/notifications", () => ({ showObjectSuccess: vi.fn() }));

beforeEach(async () => {
	mocks.show.mockClear();
	mocks.useAccessList.mockReturnValue({
		data: { clients: [], id: 73, items: [], meta: "null", name: "Legacy access list" },
		error: null,
		isLoading: false,
	});
	await changeLocale("de");
});

afterEach(async () => {
	cleanup();
	await changeLocale("en");
});

describe("AccessListModal", () => {
	it("renders an access list whose legacy JSON meta is null", async () => {
		const { showAccessListModal } = await import("./AccessListModal");
		showAccessListModal(73);
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("Access list modal was not registered");
		}

		expect(() => render(<ModalComponent remove={mocks.remove} visible />)).not.toThrow();
	});

	it("shows localized generic errors when loading an access list fails without a server message", async () => {
		mocks.useAccessList.mockReturnValue({ data: undefined, error: { message: "" }, isLoading: false });
		const { showAccessListModal } = await import("./AccessListModal");
		showAccessListModal(73);
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("Access list modal was not registered");
		}

		render(<ModalComponent remove={mocks.remove} visible />);

		expect(await screen.findByText("Fehler")).toBeInTheDocument();
		expect(await screen.findByText("Unbekannter Fehler")).toBeInTheDocument();
		expect(screen.queryByText("Error")).not.toBeInTheDocument();
		expect(screen.queryByText("Unknown error")).not.toBeInTheDocument();
	});
});
