import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WireguardPeerModal } from "./WireguardPeerModal";
import type { WireguardListResponse, WireguardPeer } from "@/api/backend";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), getPeers: vi.fn(), getSettings: vi.fn() }));
vi.mock("@/hooks/useWireguardPeer", () => ({
	useWireguardPeer: () => ({ create: { mutate: mocks.create }, update: { mutate: mocks.update } }),
}));
vi.mock("@/api/backend/getWireguardPeers", () => ({ getWireguardPeers: mocks.getPeers }));
vi.mock("@/api/backend/wireguardSettings", () => ({ getWireguardSettings: mocks.getSettings }));
vi.mock("@/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));
const serverResponse = (subnet = "10.9.0.0/24"): WireguardListResponse => ({
	peers: [],
	server: {
		available: true,
		publicKey: "server-public-key",
		endpoint: "vpn.example.com:51820",
		listenPort: 51820,
		subnet,
		interfaceUp: true,
	},
});
const clients: QueryClient[] = [];
const mount = (peer?: WireguardPeer, cached?: WireguardListResponse) => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } } });
	clients.push(client);
	if (cached) client.setQueryData(["wireguard-peers"], cached);
	const view = render(
		<QueryClientProvider client={client}>
			<WireguardPeerModal open peer={peer} onOpenChange={vi.fn()} />
		</QueryClientProvider>,
	);
	return { client, ...view };
};

describe("WireguardPeerModal", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.getPeers.mockResolvedValue(serverResponse());
		mocks.getSettings.mockRejectedValue(new Error("settings:get denied"));
	});
	afterEach(() => {
		cleanup();
		for (const client of clients.splice(0)) client.clear();
	});

	it("creates with the current server subnet without requiring settings:get", async () => {
		mount();
		await waitFor(() => expect(screen.getByLabelText("wireguard.peer.allowedIps")).toHaveValue("10.9.0.0/24"));
		fireEvent.change(screen.getByLabelText("wireguard.peer.name"), { target: { value: "Laptop" } });
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(mocks.create).toHaveBeenCalled());
		expect(mocks.create.mock.calls[0][0]).toMatchObject({ name: "Laptop", allowed_ips: "10.9.0.0/24" });
		expect(mocks.getSettings).not.toHaveBeenCalled();
	});

	it("waits for a fresh server response instead of creating with cached settings", async () => {
		let resolveResponse!: (response: WireguardListResponse) => void;
		mocks.getPeers.mockReturnValue(new Promise<WireguardListResponse>((resolve) => (resolveResponse = resolve)));
		mount(undefined, serverResponse("10.8.0.0/24"));
		fireEvent.change(screen.getByLabelText("wireguard.peer.name"), { target: { value: "Laptop" } });
		expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		expect(mocks.create).not.toHaveBeenCalled();
		resolveResponse(serverResponse());
		await waitFor(() => expect(screen.getByRole("button", { name: "save" })).toBeEnabled());
		expect(screen.getByLabelText("wireguard.peer.name")).toHaveValue("Laptop");
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(mocks.create).toHaveBeenCalled());
		expect(mocks.create.mock.calls[0][0].allowed_ips).toBe("10.9.0.0/24");
	});

	it("preserves a manual route when the server query updates", async () => {
		const { client } = mount();
		await waitFor(() => expect(screen.getByLabelText("wireguard.peer.allowedIps")).toHaveValue("10.9.0.0/24"));
		fireEvent.change(screen.getByLabelText("wireguard.peer.name"), { target: { value: "Laptop" } });
		fireEvent.change(screen.getByLabelText("wireguard.peer.allowedIps"), { target: { value: "192.168.1.0/24" } });
		client.setQueryData(["wireguard-peers"], serverResponse("10.10.0.0/24"));
		await waitFor(() => expect(screen.getByLabelText("wireguard.peer.allowedIps")).toHaveValue("192.168.1.0/24"));
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(mocks.create).toHaveBeenCalled());
		expect(mocks.create.mock.calls[0][0].allowed_ips).toBe("192.168.1.0/24");
	});

	it("keeps creation disabled on a server-load failure and permits retry", async () => {
		mocks.getPeers.mockRejectedValueOnce(new Error("Server information unavailable"));
		mount(undefined, serverResponse("10.8.0.0/24"));
		await screen.findByText("Server information unavailable");
		expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
		expect(mocks.create).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "wireguard.refresh" }));
		await waitFor(() => expect(screen.getByLabelText("wireguard.peer.allowedIps")).toHaveValue("10.9.0.0/24"));
		expect(screen.getByRole("button", { name: "save" })).toBeEnabled();
	});

	it("preserves a saved peer route, explicitly disabled keepalive and empty DNS", async () => {
		const peer = {
			id: 7,
			name: "Peer",
			persistentKeepalive: 0,
			allowedIps: "10.0.0.0/24",
			dns: "",
		} as WireguardPeer;
		mount(peer);
		expect(screen.getByLabelText("wireguard.peer.allowedIps")).toHaveValue("10.0.0.0/24");
		expect(screen.getByLabelText("wireguard.peer.keepalive")).toHaveValue(0);
		expect(screen.getByLabelText("wireguard.peer.dns")).toHaveValue("");
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(mocks.update).toHaveBeenCalled());
		expect(mocks.update.mock.calls[0][0].data).toMatchObject({
			allowed_ips: "10.0.0.0/24",
			persistent_keepalive: 0,
			dns: "",
		});
		expect(mocks.getPeers).not.toHaveBeenCalled();
	});
});
