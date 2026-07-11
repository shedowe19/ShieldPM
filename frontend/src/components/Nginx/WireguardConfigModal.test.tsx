import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WireguardConfigModal } from "./WireguardConfigModal";
import { getWireguardPeerConfig, getWireguardPeerQRCode } from "@/api/backend";
import { changeLocale } from "@/locale";

vi.mock("@/api/backend", () => ({
	getWireguardPeerConfig: vi.fn(),
	getWireguardPeerQRCode: vi.fn(),
}));

afterEach(async () => {
	cleanup();
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
});
