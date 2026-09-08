import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { showError } from "src/notifications";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WireguardConfigModal } from "./WireguardConfigModal";
import { getWireguardPeerConfig, getWireguardPeerQRCode } from "@/api/backend";
import { changeLocale } from "@/locale";

vi.mock("@/api/backend", () => ({
	getWireguardPeerConfig: vi.fn(),
	getWireguardPeerQRCode: vi.fn(),
}));
vi.mock("src/notifications", () => ({ showError: vi.fn() }));

afterEach(async () => {
	cleanup();
	vi.restoreAllMocks();
	vi.clearAllMocks();
	await changeLocale("en-US");
});

beforeEach(() => {
	vi.mocked(getWireguardPeerConfig).mockResolvedValue({ config: "[Interface]\nPrivateKey = example" });
	vi.mocked(getWireguardPeerQRCode).mockResolvedValue({ qrcode: "data:image/png;base64,example" });
});

describe("WireguardConfigModal", () => {
	it("renders QR guidance in the active locale", async () => {
		await changeLocale("de-DE");

		render(<WireguardConfigModal open onOpenChange={vi.fn()} peerId={1} peerName="Telefon" />);

		await screen.findByRole("dialog", {
			description: "WireGuard-Peer-Konfiguration herunterladen oder als QR-Code anzeigen.",
		});
		await screen.findByText(/PrivateKey = example/);
		const qrCodeTab = screen.getByRole("tab", { name: "QR-Code" });
		await waitFor(() => expect(qrCodeTab).toBeEnabled());
		fireEvent.mouseDown(qrCodeTab, { button: 0 });
		await waitFor(() => expect(qrCodeTab).toHaveAttribute("data-state", "active"));

		expect(await screen.findByText("Mit der WireGuard-Mobil-App scannen")).toBeInTheDocument();
		expect(screen.getByRole("img", { name: "WireGuard-QR-Code" })).toBeInTheDocument();
	});

	it("labels the configuration copy control for screen readers", async () => {
		await changeLocale("en-US");

		render(<WireguardConfigModal open onOpenChange={vi.fn()} peerId={1} peerName="Phone" />);

		await screen.findByText(/PrivateKey = example/);

		expect(await screen.findByRole("button", { name: "Copy configuration" })).toBeInTheDocument();
	});

	it("settles without an unhandled rejection when the configuration request fails", async () => {
		await changeLocale("en-US");
		vi.mocked(getWireguardPeerConfig).mockRejectedValue(new Error("Configuration unavailable"));

		render(<WireguardConfigModal open onOpenChange={vi.fn()} peerId={1} peerName="Phone" />);

		await waitFor(() => expect(screen.queryByText("Loading")).not.toBeInTheDocument());
		expect(screen.getByRole("button", { name: "Download Config" })).toBeDisabled();
		expect(screen.getByRole("alert")).toHaveTextContent("Configuration unavailable");
	});

	it("reports clipboard rejection without claiming a successful copy", async () => {
		vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Clipboard permission denied"));
		render(<WireguardConfigModal open onOpenChange={vi.fn()} peerId={1} peerName="Phone" />);
		await screen.findByText(/PrivateKey = example/);
		const copyButton = screen.getByRole("button", { name: "Copy configuration" });
		fireEvent.click(copyButton);
		await waitFor(() => expect(showError).toHaveBeenCalledWith("Clipboard permission denied"));
		expect(copyButton.querySelector(".text-green-500")).toBeNull();
	});

	it("ignores a clipboard write that finishes after selecting a different peer", async () => {
		let finishCopy: () => void = () => {};
		vi.spyOn(navigator.clipboard, "writeText").mockReturnValue(
			new Promise((resolve) => {
				finishCopy = resolve;
			}),
		);
		const { rerender } = render(
			<WireguardConfigModal open onOpenChange={vi.fn()} peerId={1} peerName="Old peer" />,
		);
		await screen.findByText(/PrivateKey = example/);
		fireEvent.click(screen.getByRole("button", { name: "Copy configuration" }));
		vi.mocked(getWireguardPeerConfig).mockResolvedValueOnce({ config: "New config" });
		rerender(<WireguardConfigModal open onOpenChange={vi.fn()} peerId={2} peerName="New peer" />);
		await screen.findByText("New config");
		await act(async () => finishCopy());
		expect(screen.getByRole("button", { name: "Copy configuration" }).querySelector(".text-green-500")).toBeNull();
	});

	it("clears the copied-state timeout when the dialog unmounts", async () => {
		vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
		const clearTimer = vi.spyOn(globalThis, "clearTimeout");
		const setTimer = vi.spyOn(globalThis, "setTimeout");
		const { unmount } = render(<WireguardConfigModal open onOpenChange={vi.fn()} peerId={1} peerName="Phone" />);
		await screen.findByText(/PrivateKey = example/);
		fireEvent.click(screen.getByRole("button", { name: "Copy configuration" }));
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "Copy configuration" }).querySelector(".text-green-500"),
			).not.toBeNull(),
		);
		const timerIndex = setTimer.mock.calls.findIndex(([, delay]) => delay === 2000);
		expect(timerIndex).toBeGreaterThanOrEqual(0);
		const timer = setTimer.mock.results[timerIndex].value;
		unmount();
		expect(clearTimer).toHaveBeenCalledWith(timer);
	});
});

it("ignores late responses from a previously selected peer", async () => {
	let finishOld: (data: { config: string }) => void = () => {};
	vi.mocked(getWireguardPeerConfig).mockReturnValueOnce(
		new Promise((resolve) => {
			finishOld = resolve;
		}),
	);
	const { rerender } = render(<WireguardConfigModal open onOpenChange={vi.fn()} peerId={1} peerName="Old peer" />);
	vi.mocked(getWireguardPeerConfig).mockResolvedValueOnce({ config: "New peer private key" });
	rerender(<WireguardConfigModal open onOpenChange={vi.fn()} peerId={2} peerName="New peer" />);
	await screen.findByText("New peer private key");
	await act(async () => {
		finishOld({ config: "Old peer private key" });
	});
	expect(screen.getByText("New peer private key")).toBeInTheDocument();
	expect(screen.queryByText("Old peer private key")).not.toBeInTheDocument();
});
it("disables downloading the previous peer while a new configuration is loading", async () => {
	const { rerender } = render(<WireguardConfigModal open onOpenChange={vi.fn()} peerId={1} peerName="Old peer" />);
	await screen.findByText(/PrivateKey = example/);
	vi.mocked(getWireguardPeerConfig).mockReturnValueOnce(new Promise(() => {}));
	rerender(<WireguardConfigModal open onOpenChange={vi.fn()} peerId={2} peerName="New peer" />);
	expect(screen.getByRole("button", { name: "Download Config" })).toBeDisabled();
});
