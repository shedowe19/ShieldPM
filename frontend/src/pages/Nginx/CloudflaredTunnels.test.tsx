import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudflaredTunnels } from "./CloudflaredTunnels";
import { changeLocale } from "@/locale";

const mocks = vi.hoisted(() => ({
	useHealth: vi.fn(),
}));

vi.mock("@/hooks/useCloudflaredTunnel", () => ({
	useCloudflaredTunnel: () => ({ remove: { mutate: vi.fn() } }),
	useCloudflaredTunnels: () => ({ data: [], isLoading: true, refetch: vi.fn() }),
}));

vi.mock("@/hooks/useHealth", () => ({
	useHealth: mocks.useHealth,
}));

vi.mock("@/components/Nginx/CloudflaredTunnelModal", () => ({
	CloudflaredTunnelModal: () => null,
}));

vi.mock("@/components/HasPermission", () => ({
	HasPermission: ({ children }: { children: React.ReactNode }) => children,
}));

afterEach(async () => {
	cleanup();
	mocks.useHealth.mockReset();
	await changeLocale("en-US");
});

describe("CloudflaredTunnels", () => {
	it("renders the demo restriction state in the active locale", async () => {
		mocks.useHealth.mockReturnValue({ data: { demo: true } });
		await changeLocale("de-DE");

		render(<CloudflaredTunnels />);

		expect(screen.getByRole("heading", { name: "Zugriff verweigert" })).toBeInTheDocument();
		expect(screen.getByText("Diese Funktion ist im Demo-Modus deaktiviert.")).toBeInTheDocument();
		expect(screen.getByText("Cloudflare-Tunnel sind aus Sicherheitsgründen eingeschränkt.")).toBeInTheDocument();
	});

	it("labels the refresh control in the active locale", async () => {
		mocks.useHealth.mockReturnValue({ data: { demo: false } });
		await changeLocale("de-DE");

		render(<CloudflaredTunnels />);

		expect(screen.getByRole("button", { name: "Cloudflare-Tunnel aktualisieren" })).toBeInTheDocument();
	});
});
