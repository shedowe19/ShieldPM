import { describe, expect, it, vi } from "vitest";

vi.mock("@/modals/lazy", () => {
	throw new Error("WireGuard Tunnels must not load the shared modal loader");
});

vi.mock("@/components/Nginx/WireguardConfigModal", () => ({
	WireguardConfigModal: () => null,
}));

vi.mock("@/components/Nginx/WireguardPeerModal", () => ({
	WireguardPeerModal: () => null,
}));

describe("WireguardTunnels", () => {
	it("loads without the shared modal loader", async () => {
		await expect(import("./WireguardTunnels")).resolves.toHaveProperty("default");
	});
});
