import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudflaredTunnels } from "./CloudflaredTunnels";
import { changeLocale } from "@/locale";

vi.mock("@/hooks/useCloudflaredTunnel", () => ({
	useCloudflaredTunnel: () => ({ remove: { mutate: vi.fn() } }),
	useCloudflaredTunnels: () => ({ data: [], isLoading: false, refetch: vi.fn() }),
}));

vi.mock("@/hooks/useHealth", () => ({
	useHealth: () => ({ data: { demo: true } }),
}));

vi.mock("@/components/Nginx/CloudflaredTunnelModal", () => ({
	CloudflaredTunnelModal: () => null,
}));

afterEach(async () => {
	cleanup();
	await changeLocale("en-US");
});

describe("CloudflaredTunnels", () => {
	it("renders the demo restriction state in the active locale", async () => {
		await changeLocale("de-DE");

		render(<CloudflaredTunnels />);

		expect(screen.getByRole("heading", { name: "Zugriff verweigert" })).toBeInTheDocument();
		expect(screen.getByText("Diese Funktion ist im Demo-Modus deaktiviert.")).toBeInTheDocument();
		expect(screen.getByText("Cloudflare-Tunnel sind aus Sicherheitsgründen eingeschränkt.")).toBeInTheDocument();
	});
});
