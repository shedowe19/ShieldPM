import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("./ProxyHostConfigPreview", () => ({ default: () => null }));
vi.mock("./ProxyHostDetailsTab", async () => {
	const { Field } = await import("formik");
	return { default: () => <Field name="forwardHost" aria-label="forward host" /> };
});
vi.mock("./ProxyHostMaintenanceTab", () => ({ default: () => null }));
vi.mock("./ProxyHostNotesTab", () => ({ default: () => null }));
vi.mock("./ProxyHostSecurityTab", async () => {
	const { useFormikContext } = await import("formik");
	const { TabsContent } = await import("src/components/ui/tabs");
	const { PROXY_HOST_TAB } = await import("src/types/enums");
	const SecurityDraft = () => {
		const { setFieldValue } = useFormikContext();
		return (
			<TabsContent value={PROXY_HOST_TAB.SECURITY}>
				<button
					type="button"
					onClick={() => setFieldValue("meta.ipFirewall.asnDenylist", [{ asn: 0, reason: "" }])}
				>
					Add invalid ASN
				</button>
				<button type="button" onClick={() => setFieldValue("meta.ipFirewall.asnDenylist", [])}>
					Remove ASN
				</button>
			</TabsContent>
		);
	};
	return { default: SecurityDraft };
});
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
	it("preserves an edited upstream when the host is refreshed in the background", async () => {
		mocks.useProxyHost.mockReturnValue({ data: { id: 73, forwardHost: "old.example.test" }, isLoading: false });
		mocks.useUser.mockReturnValue({ data: { id: 1 }, isLoading: false });
		const { showProxyHostModal } = await import("./ProxyHostModal");
		showProxyHostModal(73);
		const Modal = mocks.show.mock.calls[0][0];
		const { rerender } = render(<Modal id={73} remove={vi.fn()} visible />);
		const input = screen.getByLabelText("forward host");
		fireEvent.change(input, { target: { value: "edited.example.test" } });
		mocks.useProxyHost.mockReturnValue({
			data: { id: 73, forwardHost: "refetched.example.test" },
			isLoading: false,
		});
		rerender(<Modal id={73} remove={vi.fn()} visible />);
		await waitFor(() => expect(input).toHaveValue("edited.example.test"));
	});

	it("blocks saving an invalid ASN draft after leaving its security tab and allows explicit removal", async () => {
		const mutate = vi.fn();
		mocks.useSetProxyHost.mockReturnValue({ mutate });
		mocks.useProxyHost.mockReturnValue({ data: { id: 73, forwardHost: "app.test" }, isLoading: false });
		mocks.useUser.mockReturnValue({ data: { id: 1 }, isLoading: false });
		const { showProxyHostModal } = await import("./ProxyHostModal");
		showProxyHostModal(73);
		const Modal = mocks.show.mock.calls[0][0];
		render(<Modal id={73} remove={vi.fn()} visible />);
		const save = screen.getByRole("button", { name: "Speichern" });
		fireEvent.mouseDown(screen.getAllByRole("tab")[3], { button: 0, ctrlKey: false });
		fireEvent.click(await screen.findByRole("button", { name: "Add invalid ASN" }));
		await waitFor(() => expect(save).toBeDisabled());
		fireEvent.mouseDown(screen.getAllByRole("tab")[0], { button: 0, ctrlKey: false });
		await waitFor(() => expect(screen.queryByRole("button", { name: "Add invalid ASN" })).not.toBeInTheDocument());
		expect(save).toBeDisabled();
		fireEvent.click(save);
		expect(mutate).not.toHaveBeenCalled();
		fireEvent.mouseDown(screen.getAllByRole("tab")[3], { button: 0, ctrlKey: false });
		fireEvent.click(await screen.findByRole("button", { name: "Remove ASN" }));
		await waitFor(() => expect(save).not.toBeDisabled());
	});
});
