import { describe, expect, it, vi } from "vitest";

vi.mock("@/modals", () => {
	throw new Error("Cloudflared Tunnels must not eagerly import the modal barrel");
});

vi.mock("@/components/Nginx/CloudflaredTunnelModal", () => ({
	CloudflaredTunnelModal: () => null,
}));

describe("CloudflaredTunnels", () => {
	it("loads without eagerly importing the modal barrel", async () => {
		await expect(import("./CloudflaredTunnels")).resolves.toHaveProperty("default");
	});
});
