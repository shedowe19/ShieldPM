import { cleanup, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	show: vi.fn(),
	useProxyHost: vi.fn(),
	useSetProxyHost: vi.fn(),
	useUser: vi.fn(),
}));

vi.mock("@tabler/icons-react", () => ({
	IconBolt: () => null,
	IconGitBranch: () => null,
	IconNote: () => null,
	IconSettings: () => null,
	IconShieldLock: () => null,
	IconTool: () => null,
}));

vi.mock("ez-modal-react", () => ({
	default: {
		create: <T,>(Component: T) => Component,
		show: mocks.show,
	},
}));

vi.mock("lucide-react", () => ({ AlertCircle: () => null, Loader2: () => null }));

vi.mock("src/components", () => ({
	GitSyncTab: () => null,
	HasPermission: ({ children }: PropsWithChildren) => <>{children}</>,
	Loading: () => <div>loading</div>,
	LocationsFields: () => null,
	NoteWarning: () => null,
}));

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children }: PropsWithChildren) => <div role="dialog">{children}</div>,
	DialogContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogFooter: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));

vi.mock("src/hooks", () => ({
	useProxyHost: mocks.useProxyHost,
	useSetProxyHost: mocks.useSetProxyHost,
	useUser: mocks.useUser,
}));

vi.mock("./ProxyHostAdvancedTab", () => ({ default: () => null }));
vi.mock("./ProxyHostDetailsTab", () => ({ default: () => null }));
vi.mock("./ProxyHostMaintenanceTab", () => ({ default: () => null }));
vi.mock("./ProxyHostNotesTab", () => ({ default: () => null }));
vi.mock("./ProxyHostSecurityTab", () => ({ default: () => null }));
vi.mock("./ProxyHostSslTab", () => ({ default: () => null }));

beforeEach(async () => {
	mocks.show.mockClear();
	mocks.useProxyHost.mockReturnValue({ data: undefined, error: null, isLoading: true });
	mocks.useSetProxyHost.mockReturnValue({ mutate: vi.fn() });
	mocks.useUser.mockReturnValue({ data: undefined, error: null, isLoading: false });
	await changeLocale("de");
});

afterEach(async () => {
	cleanup();
	await changeLocale("en");
});

describe("ProxyHostModal", () => {
	it("keeps a loading indicator visible while the proxy host is loading", async () => {
		const { showProxyHostModal } = await import("./ProxyHostModal");
		showProxyHostModal(73);
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("Proxy host modal was not registered");
		}

		render(<ModalComponent id={73} remove={vi.fn()} visible />);

		expect(screen.getByText("loading")).toBeInTheDocument();
	});

	it("shows localized generic errors when loading a proxy host fails without a server message", async () => {
		mocks.useProxyHost.mockReturnValue({ data: undefined, error: { message: "" }, isLoading: false });
		const { showProxyHostModal } = await import("./ProxyHostModal");
		showProxyHostModal(73);
		const ModalComponent = mocks.show.mock.calls[0]?.[0];

		if (!ModalComponent) {
			throw new Error("Proxy host modal was not registered");
		}

		render(<ModalComponent id={73} remove={vi.fn()} visible />);

		expect(await screen.findByText("Fehler")).toBeInTheDocument();
		expect(await screen.findByText("Unbekannter Fehler")).toBeInTheDocument();
		expect(screen.queryByText("Error")).not.toBeInTheDocument();
		expect(screen.queryByText("Unknown error")).not.toBeInTheDocument();
	});
});
