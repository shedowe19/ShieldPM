import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WireguardPeerModal } from "./WireguardPeerModal";
import type { WireguardPeer } from "@/api/backend";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/hooks/useWireguardPeer", () => ({
	useWireguardPeer: () => ({ create: { mutate: vi.fn() }, update: { mutate: mocks.update } }),
}));
vi.mock("@/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));
afterEach(cleanup);
it("preserves explicitly disabled keepalive and empty DNS when editing a peer", async () => {
	const peer = { id: 7, name: "Peer", persistentKeepalive: 0, allowedIps: "10.0.0.0/24", dns: "" } as WireguardPeer;
	render(<WireguardPeerModal open peer={peer} onOpenChange={vi.fn()} />);
	expect(screen.getByLabelText("wireguard.peer.keepalive")).toHaveValue(0);
	expect(screen.getByLabelText("wireguard.peer.dns")).toHaveValue("");
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(mocks.update).toHaveBeenCalled());
	expect(mocks.update.mock.calls[0][0].data).toMatchObject({ persistent_keepalive: 0, dns: "" });
});
