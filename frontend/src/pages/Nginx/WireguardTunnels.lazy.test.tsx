import { describe, expect, it, vi } from "vitest";

vi.mock("@/modals", () => {
	throw new Error("WireGuard Tunnels must not eagerly import the modal barrel");
});

vi.mock("@/components/Nginx/WireguardConfigModal", () => ({
	WireguardConfigModal: () => null,
}));

vi.mock("@/components/Nginx/WireguardPeerModal", () => ({
	WireguardPeerModal: () => null,
}));

describe("WireguardTunnels", () => {
	it("loads without eagerly importing the modal barrel", async () => {
		await expect(import("./WireguardTunnels")).resolves.toHaveProperty("default");
	});
});
